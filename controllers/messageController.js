const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Property = require('../models/Property');
const Service = require('../models/Service');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');
const { broadcastToUser, broadcastToConversation } = require('../hooks/websocket');

// Simple in-memory cache for business chat performance
const messageCache = new Map();
const conversationCache = new Map();
const CACHE_TTL = 10000; // 10 seconds for conversations
const MESSAGE_CACHE_TTL = 5000; // 5 seconds for messages

// Clear old cache entries every minute
setInterval(() => {
  const now = Date.now();
  
  for (const [key, value] of conversationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      conversationCache.delete(key);
    }
  }
  
  for (const [key, value] of messageCache.entries()) {
    if (now - value.timestamp > MESSAGE_CACHE_TTL) {
      messageCache.delete(key);
    }
  }
}, 60000);

// Helper function to calculate unread count
const calculateUnreadCount = (unreadCounts, userId) => {
  if (!unreadCounts || !Array.isArray(unreadCounts)) return 0;
  
  const userUnread = unreadCounts.find(uc => 
    uc.user && uc.user.toString() === userId.toString()
  );
  
  return userUnread ? userUnread.count : 0;
};

// Helper function to clear user cache
const clearUserCache = (userId) => {
  for (const [key] of conversationCache.entries()) {
    if (key.includes(`conversations_${userId}`) || key.includes(`unread_count_${userId}`)) {
      conversationCache.delete(key);
    }
  }
};

// Helper function to clear message cache
const clearMessageCache = (conversationId, userId) => {
  messageCache.delete(`messages_${conversationId}_${userId}`);
};

class MessageController {
  // Send a new message - OPTIMIZED FOR BUSINESS CHAT
  async sendMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { conversationId, receiverId, content, messageType, replyTo, propertyId, serviceId } = req.body;
      const senderId = req.user.id;
      
      let conversation;
      let finalReceiverId = receiverId;
      
      // If conversationId is provided, use existing conversation
      if (conversationId) {
        conversation = await Conversation.findById(conversationId)
          .populate('participants', 'firstName lastName profileImage');
        
        if (!conversation) {
          return res.status(404).json({
            success: false,
            message: 'Conversation not found'
          });
        }
        
        // Check if user is a participant
        if (!conversation.participants.some(p => p._id.toString() === senderId)) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to send message in this conversation'
          });
        }
        
        // Get receiver from participants
        const receiver = conversation.participants.find(p => p._id.toString() !== senderId);
        if (!receiver) {
          return res.status(400).json({
            success: false,
            message: 'No receiver found in conversation'
          });
        }
        
        finalReceiverId = receiver._id;
      } else {
        // Create new conversation or find existing one
        if (!receiverId) {
          return res.status(400).json({
            success: false,
            message: 'Receiver ID is required for new conversation'
          });
        }
        
        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
          return res.status(404).json({
            success: false,
            message: 'Receiver not found'
          });
        }
        
        // Check if property/service exists if sharing
        if (propertyId) {
          const property = await Property.findById(propertyId);
          if (!property) {
            return res.status(404).json({
              success: false,
              message: 'Property not found'
            });
          }
        }
        
        if (serviceId) {
          const service = await Service.findById(serviceId);
          if (!service) {
            return res.status(404).json({
              success: false,
              message: 'Service not found'
            });
          }
        }
        
        // Find or create conversation
        conversation = await Conversation.findOrCreate(
          [senderId, receiverId],
          { property: propertyId, service: serviceId }
        );
      }
      
      // Prepare message data FIRST for immediate response
      const messageData = {
        conversationId: conversation._id,
        sender: senderId,
        receiver: finalReceiverId,
        content: content?.trim() || '',
        messageType: propertyId ? 'property' : serviceId ? 'service' : messageType || 'text',
        property: propertyId,
        service: serviceId,
        replyTo
      };
      
      // Handle file upload to Cloudinary (only if file exists)
      if (req.file && ['image', 'video', 'audio', 'document'].includes(messageType)) {
        try {
          const b64 = Buffer.from(req.file.buffer).toString('base64');
          const dataURI = `data:${req.file.mimetype};base64,${b64}`;
          
          let resourceType = 'auto';
          if (req.file.mimetype.startsWith('image/')) resourceType = 'image';
          if (req.file.mimetype.startsWith('video/')) resourceType = 'video';
          if (req.file.mimetype.startsWith('audio/')) resourceType = 'video';
          
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'homely/messages',
            resource_type: resourceType,
            public_id: `message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timeout: 30000
          });
          
          messageData.attachment = {
            url: result.secure_url,
            public_id: result.public_id,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
          };
          
          if (messageType === 'image' || messageType === 'video') {
            const thumbnail = await cloudinary.url(result.public_id, {
              transformation: [
                { width: 300, height: 200, crop: 'fill' },
                { quality: 'auto:good' }
              ]
            });
            messageData.attachment.thumbnailUrl = thumbnail;
          }
        } catch (uploadError) {
          console.error('Cloudinary upload error:', uploadError);
          // Continue without attachment if upload fails
        }
      }
      
      // Prepare shared item data
      if (propertyId) {
        const property = await Property.findById(propertyId)
          .select('title price location images status');
        
        const primaryImage = property.images?.find(img => img.isPrimary) || property.images?.[0];
        
        messageData.sharedItem = {
          type: 'property',
          title: property.title,
          price: property.price,
          location: property.location,
          status: property.status,
          image: primaryImage?.url || ''
        };
      }
      
      if (serviceId) {
        const service = await Service.findById(serviceId)
          .select('title price location category images');
        
        const primaryImage = service.images?.find(img => img.isPrimary) || service.images?.[0];
        
        messageData.sharedItem = {
          type: 'service',
          title: service.title,
          price: service.price,
          location: service.location,
          category: service.category,
          image: primaryImage?.url || ''
        };
      }
      
      // Create and save message
      const message = new Message(messageData);
      await message.save();
      
      // Update conversation with last message
      conversation.lastMessage = message._id;
      conversation.lastMessageText = message.getPreview();
      conversation.lastMessageType = message.messageType;
      conversation.lastMessageSender = senderId;
      conversation.lastMessageTime = new Date();
      
      // Increment unread counts
      await conversation.incrementUnreadCounts(senderId);
      await conversation.save();
      
      // Populate message with sender info (basic population first for immediate response)
      const basicMessage = await Message.findById(message._id)
        .populate('sender', 'firstName lastName profileImage userType')
        .populate('receiver', 'firstName lastName profileImage')
        .lean();
      
      // Clear cache for affected users
      clearUserCache(senderId);
      clearUserCache(finalReceiverId);
      conversationCache.delete(`conversations_${senderId}`);
      conversationCache.delete(`conversations_${finalReceiverId}`);
      clearMessageCache(conversation._id, senderId);
      clearMessageCache(conversation._id, finalReceiverId);
      
      // Send immediate response
      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          ...basicMessage,
          conversationId: conversation._id
        }
      });
      
      // Continue with additional processing in background
      setTimeout(async () => {
        try {
          // Full population for WebSocket broadcast
          const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'firstName lastName profileImage userType')
            .populate('receiver', 'firstName lastName profileImage')
            .populate('property', 'title price location images status')
            .populate('service', 'title price location category images')
            .populate('replyTo');
          
          // Broadcast via WebSocket
          try {
            broadcastToConversation(conversation._id, {
              type: 'NEW_MESSAGE',
              message: populatedMessage
            }, senderId);
            
            broadcastToUser(senderId, {
              type: 'MESSAGE_SENT',
              message: populatedMessage,
              conversationId: conversation._id
            });
          } catch (wsError) {
            console.error('WebSocket broadcast error:', wsError);
          }
        } catch (error) {
          console.error('Background processing error:', error);
        }
      }, 0); // Process in next tick
      
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending message',
        error: error.message
      });
    }
  }
  
  // Upload attachment separately
  async uploadAttachment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { messageType } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      
      let resourceType = 'auto';
      if (req.file.mimetype.startsWith('image/')) resourceType = 'image';
      if (req.file.mimetype.startsWith('video/')) resourceType = 'video';
      if (req.file.mimetype.startsWith('audio/')) resourceType = 'video';
      
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'homely/messages',
        resource_type: resourceType,
        public_id: `message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ],
        timeout: 30000
      });
      
      const attachment = {
        url: result.secure_url,
        public_id: result.public_id,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format
      };
      
      if (messageType === 'image' || messageType === 'video') {
        const thumbnail = await cloudinary.url(result.public_id, {
          transformation: [
            { width: 300, height: 200, crop: 'fill' },
            { quality: 'auto:good' }
          ]
        });
        attachment.thumbnailUrl = thumbnail;
      }
      
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        attachment,
        messageType
      });
      
    } catch (error) {
      console.error('Upload attachment error:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading file',
        error: error.message
      });
    }
  }
  
  // Get messages in a conversation - WITH CACHING
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      // Check cache first
      const cacheKey = `messages_${conversationId}_${userId}`;
      const cached = messageCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < MESSAGE_CACHE_TTL) {
        return res.status(200).json(cached.data);
      }
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      
      if (!conversation.participants.some(p => p.toString() === userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this conversation'
        });
      }
      
      // Use lean query for better performance
      const messages = await Message.find({
        conversationId,
        isDeleted: false
      })
      .populate('sender', 'firstName lastName profileImage userType')
      .populate('receiver', 'firstName lastName profileImage')
      .populate('property', 'title price location images status')
      .populate('service', 'title price location category images')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
      
      const unreadMessageIds = messages
        .filter(msg => 
          msg.sender._id.toString() !== userId && 
          !msg.readBy.some(id => id.toString() === userId)
        )
        .map(msg => msg._id);
      
      if (unreadMessageIds.length > 0) {
        await Message.markAsRead(unreadMessageIds, userId);
        await conversation.resetUnreadCount(userId);
        
        try {
          broadcastToConversation(conversationId, {
            type: 'MESSAGE_READ',
            messageIds: unreadMessageIds,
            userId: userId
          }, userId);
        } catch (wsError) {
          console.error('WebSocket broadcast error:', wsError);
        }
      }
      
      const response = {
        success: true,
        messages: messages.reverse(),
        conversation: {
          _id: conversation._id,
          participants: conversation.participants,
          property: conversation.property,
          service: conversation.service,
          unreadCount: calculateUnreadCount(conversation.unreadCounts, userId)
        }
      };
      
      // Cache the response
      messageCache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
      });
      
      res.status(200).json(response);
      
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching messages',
        error: error.message
      });
    }
  }
  
  // Get user conversations - WITH CACHING
  async getConversations(req, res) {
    try {
      const userId = req.user.id;
      
      // Check cache first
      const cacheKey = `conversations_${userId}`;
      const cached = conversationCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.status(200).json(cached.data);
      }
      
      // Use lean query and limit for better performance
      const conversations = await Conversation.find({
        participants: userId,
        isArchived: false
      })
      .populate('participants', 'firstName lastName profileImage userType')
      .populate('lastMessageSender', 'firstName lastName profileImage')
      .populate('property', 'title price location images')
      .populate('service', 'title price location category images')
      .sort({ lastMessageTime: -1 })
      .limit(50)
      .lean();
      
      const formattedConversations = conversations.map(conversation => {
        let otherParticipant = null;
        
        if (conversation.isGroup) {
          const participantNames = conversation.participants
            .filter(p => p && p._id.toString() !== userId.toString())
            .map(p => `${p.firstName} ${p.lastName}`)
            .slice(0, 2)
            .join(', ');
          
          otherParticipant = {
            _id: conversation._id,
            firstName: conversation.name || participantNames || 'Group Chat',
            lastName: '',
            profileImage: conversation.avatar,
            userType: 'group'
          };
        } else {
          otherParticipant = conversation.participants.find(
            p => p && p._id.toString() !== userId.toString()
          );
          
          if (!otherParticipant) {
            otherParticipant = {
              _id: conversation._id,
              firstName: 'Unknown',
              lastName: 'User',
              profileImage: '',
              userType: 'user'
            };
          }
        }
        
        return {
          _id: conversation._id,
          participant: otherParticipant,
          participants: conversation.participants,
          isGroup: conversation.isGroup,
          name: conversation.name || (otherParticipant ? 
            `${otherParticipant.firstName} ${otherParticipant.lastName}`.trim() : 'Chat'),
          avatar: conversation.avatar || (otherParticipant?.profileImage || ''),
          lastMessage: conversation.lastMessageText,
          lastMessageType: conversation.lastMessageType,
          lastMessageTime: conversation.lastMessageTime,
          unreadCount: calculateUnreadCount(conversation.unreadCounts, userId),
          property: conversation.property,
          service: conversation.service,
          updatedAt: conversation.updatedAt
        };
      });
      
      const response = {
        success: true,
        conversations: formattedConversations,
        total: formattedConversations.length
      };
      
      // Cache the response
      conversationCache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
      });
      
      res.status(200).json(response);
      
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching conversations',
        error: error.message
      });
    }
  }
  
  // Mark all messages as read in a conversation
  async markAllAsRead(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      
      if (!conversation.participants.some(p => p.toString() === userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to mark messages as read in this conversation'
        });
      }
      
      const unreadMessages = await Message.find({
        conversationId,
        sender: { $ne: userId },
        readBy: { $ne: userId },
        isDeleted: false
      });
      
      const messageIds = unreadMessages.map(msg => msg._id);
      
      if (messageIds.length > 0) {
        await Message.markAsRead(messageIds, userId);
        await conversation.resetUnreadCount(userId);
        
        // Clear cache for this conversation
        messageCache.delete(`messages_${conversationId}_${userId}`);
        conversationCache.delete(`conversations_${userId}`);
        
        try {
          broadcastToConversation(conversationId, {
            type: 'MESSAGE_READ',
            messageIds,
            userId: userId
          }, userId);
        } catch (wsError) {
          console.error('WebSocket broadcast error:', wsError);
        }
      }
      
      res.status(200).json({
        success: true,
        message: 'All messages marked as read',
        count: messageIds.length
      });
      
    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Error marking messages as read',
        error: error.message
      });
    }
  }
  
  // Delete a message
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;
      
      const message = await Message.findById(messageId);
      
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }
      
      if (message.sender.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this message'
        });
      }
      
      message.isDeleted = true;
      await message.save();
      
      // Clear cache for affected users
      clearMessageCache(message.conversationId, userId);
      clearMessageCache(message.conversationId, message.receiver.toString());
      
      try {
        broadcastToConversation(message.conversationId, {
          type: 'MESSAGE_DELETED',
          messageId,
          userId: userId
        });
      } catch (wsError) {
        console.error('WebSocket broadcast error:', wsError);
      }
      
      res.status(200).json({
        success: true,
        message: 'Message deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting message',
        error: error.message
      });
    }
  }
  
  // Share a property in chat
  async shareProperty(req, res) {
    try {
      const { conversationId, receiverId, propertyId, message } = req.body;
      
      const property = await Property.findById(propertyId)
        .select('title price location images status postedBy');
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      req.body = {
        conversationId,
        receiverId,
        content: message || `Check out this property: ${property.title}`,
        messageType: 'property',
        propertyId
      };
      
      return this.sendMessage(req, res);
      
    } catch (error) {
      console.error('Share property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error sharing property',
        error: error.message
      });
    }
  }
  
  // Share a service in chat
  async shareService(req, res) {
    try {
      const { conversationId, receiverId, serviceId, message } = req.body;
      
      const service = await Service.findById(serviceId)
        .select('title price location category images postedBy');
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      req.body = {
        conversationId,
        receiverId,
        content: message || `Check out this service: ${service.title}`,
        messageType: 'service',
        serviceId
      };
      
      return this.sendMessage(req, res);
      
    } catch (error) {
      console.error('Share service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error sharing service',
        error: error.message
      });
    }
  }
  
  // Start a conversation from property/service page
  async startConversation(req, res) {
    try {
      const { itemType, itemId, receiverId, initialMessage } = req.body;
      const senderId = req.user.id;
      
      if (!['property', 'service'].includes(itemType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type. Must be "property" or "service"'
        });
      }
      
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: 'Receiver not found'
        });
      }
      
      let item;
      if (itemType === 'property') {
        item = await Property.findById(itemId)
          .select('title price location images postedBy');
        
        if (!item) {
          return res.status(404).json({
            success: false,
            message: 'Property not found'
          });
        }
      } else {
        item = await Service.findById(itemId)
          .select('title price location category images postedBy provider');
        
        if (!item) {
          return res.status(404).json({
            success: false,
            message: 'Service not found'
          });
        }
      }
      
      if (senderId.toString() === receiverId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You cannot message yourself'
        });
      }
      
      const conversation = await Conversation.findOrCreate(
        [senderId, receiverId],
        { [itemType]: itemId }
      );
      
      if (initialMessage) {
        const message = new Message({
          conversationId: conversation._id,
          sender: senderId,
          receiver: receiverId,
          content: initialMessage,
          messageType: 'text'
        });
        
        await message.save();
        
        conversation.lastMessage = message._id;
        conversation.lastMessageText = message.getPreview();
        conversation.lastMessageType = 'text';
        conversation.lastMessageSender = senderId;
        conversation.lastMessageTime = new Date();
        await conversation.incrementUnreadCounts(senderId);
        await conversation.save();
        
        await message.populate('sender', 'firstName lastName profileImage userType');
        await message.populate('receiver', 'firstName lastName profileImage');
      }
      
      const populatedConversation = await Conversation.findById(conversation._id)
        .populate('participants', 'firstName lastName profileImage userType')
        .populate('property', 'title price location images')
        .populate('service', 'title price location category images');
      
      // Clear cache for both users
      conversationCache.delete(`conversations_${senderId}`);
      conversationCache.delete(`conversations_${receiverId}`);
      
      res.status(201).json({
        success: true,
        message: initialMessage ? 'Conversation started with message' : 'Conversation created successfully',
        conversation: populatedConversation
      });
      
    } catch (error) {
      console.error('Start conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Error starting conversation',
        error: error.message
      });
    }
  }
  
  // Mark messages as read
  async markAsRead(req, res) {
    try {
      const { messageIds, conversationId } = req.body;
      const userId = req.user.id;
      
      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Message IDs array is required'
        });
      }
      
      await Message.markAsRead(messageIds, userId);
      
      if (conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.resetUnreadCount(userId);
          
          // Clear cache
          conversationCache.delete(`conversations_${userId}`);
          messageCache.delete(`messages_${conversationId}_${userId}`);
        }
      }
      
      try {
        if (conversationId) {
          broadcastToConversation(conversationId, {
            type: 'MESSAGE_READ',
            messageIds,
            userId: userId
          }, userId);
        }
      } catch (wsError) {
        console.error('WebSocket broadcast error:', wsError);
      }
      
      res.status(200).json({
        success: true,
        message: 'Messages marked as read'
      });
      
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Error marking messages as read',
        error: error.message
      });
    }
  }
  
  // Search messages
  async searchMessages(req, res) {
    try {
      const { query, conversationId } = req.query;
      const userId = req.user.id;
      
      if (!query || query.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }
      
      let searchQuery = {
        $or: [
          { content: { $regex: query, $options: 'i' } },
          { 'sharedItem.title': { $regex: query, $options: 'i' } }
        ],
        isDeleted: false
      };
      
      if (conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return res.status(404).json({
            success: false,
            message: 'Conversation not found'
          });
        }
        
        if (!conversation.participants.some(p => p.toString() === userId)) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to search in this conversation'
          });
        }
        
        searchQuery.conversationId = conversationId;
      } else {
        const userConversations = await Conversation.find({
          participants: userId
        }).select('_id');
        
        const conversationIds = userConversations.map(c => c._id);
        searchQuery.conversationId = { $in: conversationIds };
      }
      
      const messages = await Message.find(searchQuery)
        .populate('sender', 'firstName lastName profileImage')
        .populate('conversationId')
        .populate('property', 'title price location')
        .populate('service', 'title price location category')
        .sort({ createdAt: -1 })
        .limit(50);
      
      res.status(200).json({
        success: true,
        messages,
        total: messages.length
      });
      
    } catch (error) {
      console.error('Search messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching messages',
        error: error.message
      });
    }
  }
  
  // Get conversation by participants
  async getConversationByParticipants(req, res) {
    try {
      const { participantIds } = req.query;
      const userId = req.user.id;
      
      if (!participantIds) {
        return res.status(400).json({
          success: false,
          message: 'Participant IDs are required'
        });
      }
      
      const ids = participantIds.split(',').map(id => id.trim());
      
      if (!ids.includes(userId.toString())) {
        ids.push(userId.toString());
      }
      
      const conversation = await Conversation.findOrCreate(ids);
      
      res.status(200).json({
        success: true,
        conversation
      });
      
    } catch (error) {
      console.error('Get conversation by participants error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting conversation',
        error: error.message
      });
    }
  }
  
  // Archive conversation
  async archiveConversation(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      
      if (!conversation.participants.some(p => p.toString() === userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to archive this conversation'
        });
      }
      
      conversation.isArchived = true;
      await conversation.save();
      
      // Clear cache
      conversationCache.delete(`conversations_${userId}`);
      
      res.status(200).json({
        success: true,
        message: 'Conversation archived successfully'
      });
      
    } catch (error) {
      console.error('Archive conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Error archiving conversation',
        error: error.message
      });
    }
  }
  
  // Get unread message count
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      
      // Try cache first
      const cacheKey = `unread_count_${userId}`;
      const cached = conversationCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < 30000) {
        return res.status(200).json(cached.data);
      }
      
      const conversations = await Conversation.find({
        participants: userId,
        isArchived: false
      }).select('unreadCounts').lean();
      
      let totalUnread = 0;
      conversations.forEach(conversation => {
        totalUnread += calculateUnreadCount(conversation.unreadCounts, userId);
      });
      
      const response = {
        success: true,
        totalUnread
      };
      
      // Cache the response
      conversationCache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
      });
      
      res.status(200).json(response);
      
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting unread count',
        error: error.message
      });
    }
  }
  
  // Get conversation by property or service
  async getConversationByItem(req, res) {
    try {
      const { itemType, itemId } = req.params;
      const userId = req.user.id;
      
      if (!['property', 'service'].includes(itemType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type'
        });
      }
      
      const query = {
        participants: userId,
        [itemType]: itemId
      };
      
      const conversation = await Conversation.findOne(query)
        .populate('participants', 'firstName lastName profileImage userType')
        .populate(itemType, 'title price location images category');
      
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'No conversation found for this item'
        });
      }
      
      res.status(200).json({
        success: true,
        conversation
      });
      
    } catch (error) {
      console.error('Get conversation by item error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching conversation',
        error: error.message
      });
    }
  }
  
  // Clear conversation (delete all messages)
  async clearConversation(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      
      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      
      if (!conversation.participants.some(p => p.toString() === userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to clear this conversation'
        });
      }
      
      await Message.updateMany(
        { conversationId, sender: userId, isDeleted: false },
        { isDeleted: true }
      );
      
      // Clear cache for all participants
      conversation.participants.forEach(participantId => {
        conversationCache.delete(`conversations_${participantId}`);
        clearMessageCache(conversationId, participantId);
      });
      
      try {
        broadcastToConversation(conversationId, {
          type: 'CONVERSATION_CLEARED',
          userId: userId
        });
      } catch (wsError) {
        console.error('WebSocket broadcast error:', wsError);
      }
      
      res.status(200).json({
        success: true,
        message: 'Conversation cleared successfully'
      });
      
    } catch (error) {
      console.error('Clear conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing conversation',
        error: error.message
      });
    }
  }
}

module.exports = new MessageController();