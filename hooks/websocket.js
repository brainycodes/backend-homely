const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

let wss;
const connectedUsers = new Map(); // userId -> { ws, connectionId, lastPing }
const connectionRateLimits = new Map(); // userId -> { count, resetTime }

const setupWebSocket = (server) => {
  if (!server) {
    console.error('❌ No server provided for WebSocket');
    return;
  }

  try {
    wss = new WebSocket.Server({ 
      server, 
      path: '/ws',
      clientTracking: true,
      perMessageDeflate: false,
      maxPayload: 100 * 1024 * 1024 // 100MB
    });

    console.log('✅ WebSocket server initialized');

    // Clean up rate limits every hour
    setInterval(() => {
      const now = Date.now();
      for (const [userId, data] of connectionRateLimits.entries()) {
        if (now > data.resetTime) {
          connectionRateLimits.delete(userId);
        }
      }
    }, 3600000); // 1 hour

    wss.on('connection', async (ws, req) => {
      const connectionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`🔗 New WebSocket connection [${connectionId}] from ${req.socket.remoteAddress}`);
      
      // Set a timeout for initial handshake
      const handshakeTimeout = setTimeout(() => {
        console.log(`⏰ Handshake timeout [${connectionId}]`);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1008, 'Handshake timeout');
        }
      }, 5000); // 5 seconds for handshake

      // Extract token from query params
      const url = req.url;
      const tokenMatch = url.match(/token=([^&]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        console.log(`❌ No token provided [${connectionId}]`);
        ws.close(1008, 'No token provided');
        clearTimeout(handshakeTimeout);
        return;
      }

      let userId;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-fallback-secret-for-development');
        userId = decoded.id;
        
        // Rate limiting: max 5 connections per minute per user
        const now = Date.now();
        let rateLimit = connectionRateLimits.get(userId);
        if (!rateLimit || now > rateLimit.resetTime) {
          rateLimit = { count: 0, resetTime: now + 60000 }; // 1 minute
        }
        
        if (rateLimit.count >= 5) {
          console.log(`🚫 Rate limit exceeded for user ${userId} [${connectionId}]`);
          ws.close(1008, 'Too many connection attempts');
          clearTimeout(handshakeTimeout);
          return;
        }
        
        rateLimit.count++;
        connectionRateLimits.set(userId, rateLimit);
        
        // Close any existing connection for this user
        if (connectedUsers.has(userId)) {
          const existingConnection = connectedUsers.get(userId);
          console.log(`🔄 Closing previous connection for user ${userId} [${existingConnection.connectionId}]`);
          
          if (existingConnection.ws.readyState === WebSocket.OPEN) {
            existingConnection.ws.close(1000, 'New connection');
          }
          
          // Clean up heartbeat
          if (existingConnection.heartbeatInterval) {
            clearInterval(existingConnection.heartbeatInterval);
          }
          
          connectedUsers.delete(userId);
        }

        // Clear handshake timeout
        clearTimeout(handshakeTimeout);
        
        // Set up heartbeat
        const heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.ping();
            } catch (error) {
              console.error(`Error sending ping to user ${userId}:`, error.message);
            }
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 30000); // 30 seconds

        // Store connection info
        connectedUsers.set(userId, {
          ws,
          connectionId,
          heartbeatInterval,
          lastPing: Date.now()
        });

        ws.userId = userId;
        ws.connectionId = connectionId;
        
        console.log(`✅ User ${userId} connected [${connectionId}] (Total connections: ${connectedUsers.size})`);

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'CONNECTION_ESTABLISHED',
          message: 'WebSocket connected successfully',
          userId: userId,
          connectionId: connectionId,
          timestamp: Date.now()
        }));

        ws.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            // Update last activity time
            if (connectedUsers.has(userId)) {
              connectedUsers.get(userId).lastPing = Date.now();
            }
            
            switch (data.type) {
              case 'SEND_MESSAGE':
                await handleSendMessage(ws, data);
                break;

              case 'TYPING_START':
              case 'TYPING_STOP':
                await handleTyping(ws, data);
                break;

              case 'MARK_READ':
                await handleMarkRead(ws, data);
                break;

              case 'NEW_MESSAGE':
                await handleNewMessage(ws, data);
                break;

              case 'PING':
                ws.send(JSON.stringify({ 
                  type: 'PONG', 
                  timestamp: Date.now() 
                }));
                break;

              default:
                console.log('Unknown message type:', data.type);
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: 'Unknown message type'
                }));
            }
          } catch (error) {
            console.error('WebSocket message parse error:', error);
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Invalid message format'
            }));
          }
        });

        ws.on('pong', () => {
          // Update last ping time
          if (connectedUsers.has(userId)) {
            connectedUsers.get(userId).lastPing = Date.now();
          }
        });

        ws.on('close', (code, reason) => {
          console.log(`🔗 User ${userId} disconnected [${connectionId}] (code: ${code}, reason: ${reason || 'none'})`);
          
          // Clean up connection
          const connectionInfo = connectedUsers.get(userId);
          if (connectionInfo && connectionInfo.connectionId === connectionId) {
            if (connectionInfo.heartbeatInterval) {
              clearInterval(connectionInfo.heartbeatInterval);
            }
            connectedUsers.delete(userId);
          }
        });

        ws.on('error', (error) => {
          console.error(`❌ WebSocket error for user ${userId} [${connectionId}]:`, error.message);
          
          // Clean up on error
          const connectionInfo = connectedUsers.get(userId);
          if (connectionInfo && connectionInfo.connectionId === connectionId) {
            if (connectionInfo.heartbeatInterval) {
              clearInterval(connectionInfo.heartbeatInterval);
            }
            connectedUsers.delete(userId);
          }
        });

      } catch (error) {
        console.error(`❌ Token verification error [${connectionId}]:`, error.message);
        ws.close(1008, 'Invalid token');
        clearTimeout(handshakeTimeout);
      }
    });

    // Clean up stale connections every minute
    setInterval(() => {
      const now = Date.now();
      for (const [userId, connectionInfo] of connectedUsers.entries()) {
        if (now - connectionInfo.lastPing > 120000) { // 2 minutes without activity
          console.log(`🕒 Closing stale connection for user ${userId} [${connectionInfo.connectionId}]`);
          if (connectionInfo.ws.readyState === WebSocket.OPEN) {
            connectionInfo.ws.close(1000, 'Connection idle');
          }
          if (connectionInfo.heartbeatInterval) {
            clearInterval(connectionInfo.heartbeatInterval);
          }
          connectedUsers.delete(userId);
        }
      }
    }, 60000); // Check every minute

  } catch (error) {
    console.error('❌ WebSocket setup error:', error);
  }
};

// Rest of your handler functions (handleSendMessage, handleTyping, etc.) remain the same...

const handleSendMessage = async (ws, data) => {
  const { conversationId, content, messageType, receiverId, attachment, sharedItem } = data;

  try {
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId)
        .populate('participants', 'firstName lastName profileImage');
    } else if (receiverId) {
      conversation = await Conversation.findOrCreate([ws.userId, receiverId]);
    }

    if (!conversation) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Conversation not found'
      }));
      return;
    }

    const receiver = conversation.participants.find(p => p._id.toString() !== ws.userId);
    if (!receiver) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'No receiver found in conversation'
      }));
      return;
    }

    const message = new Message({
      conversationId: conversation._id,
      sender: ws.userId,
      receiver: receiver._id,
      content,
      messageType: messageType || 'text',
      attachment,
      sharedItem
    });

    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'firstName lastName profileImage userType')
      .populate('receiver', 'firstName lastName profileImage')
      .populate('property', 'title price location images status')
      .populate('service', 'title price location category images');

    conversation.lastMessage = message._id;
    conversation.lastMessageText = content || message.getPreview();
    conversation.lastMessageType = messageType || 'text';
    conversation.lastMessageSender = ws.userId;
    conversation.lastMessageTime = new Date();
    
    await conversation.incrementUnreadCounts(ws.userId);
    await conversation.save();

    // Broadcast to receiver
    const receiverConnection = connectedUsers.get(receiver._id.toString());
    if (receiverConnection && receiverConnection.ws.readyState === WebSocket.OPEN) {
      receiverConnection.ws.send(JSON.stringify({
        type: 'NEW_MESSAGE',
        message: populatedMessage
      }));
    }

    // Send confirmation to sender
    ws.send(JSON.stringify({
      type: 'MESSAGE_SENT',
      message: populatedMessage,
      conversationId: conversation._id
    }));

    // Broadcast conversation update
    broadcastConversationUpdate(conversation._id);

  } catch (error) {
    console.error('Error sending message:', error);
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'Failed to send message',
      error: error.message
    }));
  }
};

const handleTyping = async (ws, data) => {
  const { conversationId, isTyping } = data;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== ws.userId) {
        const participantConnection = connectedUsers.get(participantId.toString());
        if (participantConnection && participantConnection.ws.readyState === WebSocket.OPEN) {
          participantConnection.ws.send(JSON.stringify({
            type: 'USER_TYPING',
            userId: ws.userId,
            conversationId,
            isTyping: data.type === 'TYPING_START'
          }));
        }
      }
    });
  } catch (error) {
    console.error('Error handling typing:', error);
  }
};

const handleMarkRead = async (ws, data) => {
  const { messageIds, conversationId } = data;

  try {
    if (messageIds && messageIds.length > 0) {
      await Message.markAsRead(messageIds, ws.userId);
    }

    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        await conversation.resetUnreadCount(ws.userId);
      }
    }

    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        conversation.participants.forEach(participantId => {
          if (participantId.toString() !== ws.userId) {
            const participantConnection = connectedUsers.get(participantId.toString());
            if (participantConnection && participantConnection.ws.readyState === WebSocket.OPEN) {
              participantConnection.ws.send(JSON.stringify({
                type: 'MESSAGE_READ',
                messageIds,
                userId: ws.userId,
                conversationId
              }));
            }
          }
        });
      }
    }

    ws.send(JSON.stringify({
      type: 'MESSAGES_READ',
      messageIds,
      conversationId
    }));

  } catch (error) {
    console.error('Error marking messages as read:', error);
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'Failed to mark messages as read'
    }));
  }
};

const handleNewMessage = async (ws, data) => {
  try {
    const { message } = data;
    
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) return;

    const receiverConnection = connectedUsers.get(message.receiver._id.toString());
    if (receiverConnection && receiverConnection.ws.readyState === WebSocket.OPEN) {
      receiverConnection.ws.send(JSON.stringify({
        type: 'NEW_MESSAGE',
        message
      }));
    }

    broadcastConversationUpdate(conversation._id);

  } catch (error) {
    console.error('Error handling new message:', error);
  }
};

const broadcastConversationUpdate = async (conversationId) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    conversation.participants.forEach(participantId => {
      const participantConnection = connectedUsers.get(participantId.toString());
      if (participantConnection && participantConnection.ws.readyState === WebSocket.OPEN) {
        participantConnection.ws.send(JSON.stringify({
          type: 'CONVERSATION_UPDATED',
          conversationId,
          timestamp: Date.now()
        }));
      }
    });
  } catch (error) {
    console.error('Error broadcasting conversation update:', error);
  }
};

const broadcastToUser = (userId, data) => {
  const connectionInfo = connectedUsers.get(userId);
  if (connectionInfo && connectionInfo.ws.readyState === WebSocket.OPEN) {
    try {
      connectionInfo.ws.send(JSON.stringify(data));
    } catch (error) {
      console.error(`Error broadcasting to user ${userId}:`, error.message);
    }
  }
};

const broadcastToConversation = async (conversationId, data, excludeUserId = null) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    conversation.participants.forEach(participantId => {
      if (excludeUserId && participantId.toString() === excludeUserId.toString()) return;
      
      broadcastToUser(participantId.toString(), data);
    });
  } catch (error) {
    console.error('Error broadcasting to conversation:', error);
  }
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const isUserConnected = (userId) => {
  const connectionInfo = connectedUsers.get(userId);
  return connectionInfo && connectionInfo.ws.readyState === WebSocket.OPEN;
};

module.exports = {
  setupWebSocket,
  broadcastToUser,
  broadcastToConversation,
  getConnectedUsers,
  isUserConnected
};