const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');
const { uploadSingle, uploadMultiple } = require('../middleware/uploadMessageMiddleware');
const { check } = require('express-validator');

// Apply auth middleware to all routes
router.use(authMiddleware.protect);

// ========== MESSAGE ROUTES ==========

// Send a new message (with optional file attachment)
router.post('/send', 
  uploadSingle,
  [
    check('receiverId', 'Receiver ID is required if no conversationId').optional().isMongoId(),
    check('conversationId', 'Conversation ID must be valid').optional().isMongoId(),
    check('content', 'Message content is required for text messages').optional().trim(),
    check('messageType', 'Invalid message type').optional().isIn(['text', 'image', 'video', 'audio', 'document', 'property', 'service']),
    check('propertyId', 'Property ID must be valid').optional().isMongoId(),
    check('serviceId', 'Service ID must be valid').optional().isMongoId(),
    check('replyTo', 'Reply message ID must be valid').optional().isMongoId()
  ],
  messageController.sendMessage
);

// Upload attachment separately (for progress tracking)
router.post('/upload-attachment',
  uploadSingle,
  [
    check('messageType', 'Message type is required').isIn(['image', 'video', 'audio', 'document'])
  ],
  messageController.uploadAttachment
);

// Upload multiple attachments
router.post('/upload-multiple-attachments',
  uploadMultiple,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Files ready for processing',
        files: req.files.map(file => ({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        })),
        count: req.files.length
      });
    } catch (error) {
      console.error('Multiple upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading files',
        error: error.message
      });
    }
  }
);

// Get user conversations
router.get('/conversations', messageController.getConversations);

// Get messages in a conversation
router.get('/conversation/:conversationId/messages', messageController.getMessages);

// Delete a message
router.delete('/message/:messageId', messageController.deleteMessage);

// Mark messages as read
router.post('/mark-read', messageController.markAsRead);

// Mark all messages as read in a conversation
router.post('/conversation/:conversationId/mark-all-read', messageController.markAllAsRead);

// Search messages
router.get('/search', messageController.searchMessages);

// Get conversation by participants
router.get('/conversation-by-participants', messageController.getConversationByParticipants);

// Archive conversation
router.put('/conversation/:conversationId/archive', messageController.archiveConversation);

// Get unread message count
router.get('/unread-count', messageController.getUnreadCount);

// Get conversation by property or service
router.get('/conversation/:itemType/:itemId', messageController.getConversationByItem);

// Clear conversation (soft delete user's messages)
router.delete('/conversation/:conversationId/clear', messageController.clearConversation);

// ========== SHARING ROUTES ==========

// Share a property
router.post('/share/property', 
  [
    check('propertyId', 'Property ID is required').isMongoId(),
    check('receiverId', 'Receiver ID is required if no conversationId').optional().isMongoId(),
    check('conversationId', 'Conversation ID must be valid').optional().isMongoId(),
    check('message', 'Message must be a string').optional().trim()
  ],
  messageController.shareProperty
);

// Share a service
router.post('/share/service',
  [
    check('serviceId', 'Service ID is required').isMongoId(),
    check('receiverId', 'Receiver ID is required if no conversationId').optional().isMongoId(),
    check('conversationId', 'Conversation ID must be valid').optional().isMongoId(),
    check('message', 'Message must be a string').optional().trim()
  ],
  messageController.shareService
);

// Start a conversation from property/service page
router.post('/start-conversation',
  [
    check('itemType', 'Item type is required').isIn(['property', 'service']),
    check('itemId', 'Item ID is required').isMongoId(),
    check('receiverId', 'Receiver ID is required').isMongoId(),
    check('initialMessage', 'Initial message must be a string').optional().trim()
  ],
  messageController.startConversation
);

// ========== WEBSOCKET INFO ==========

// Get WebSocket connection info
router.get('/websocket-info', (req, res) => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  const wsUrl = baseUrl.startsWith('https') 
    ? `wss://${baseUrl.split('//')[1]}/ws`
    : `ws://${baseUrl.split('//')[1]}/ws`;
  
  res.status(200).json({
    success: true,
    websocketUrl: wsUrl,
    supported: true,
    heartbeatInterval: 30000,
    instructions: 'Connect with WebSocket using JWT token from localStorage',
    example: `${wsUrl}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  });
});

module.exports = router;