const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'document', 'property', 'service'],
    default: 'text'
  },
  
  // For file attachments
  attachment: {
    url: String,
    public_id: String,
    originalname: String,
    mimetype: String,
    size: Number,
    thumbnailUrl: String
  },
  
  // For property sharing
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  },
  
  // For service sharing
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  
  // Shared item preview data
  sharedItem: {
    type: {
      type: String,
      enum: ['property', 'service']
    },
    title: String,
    price: Number,
    image: String,
    location: String,
    category: String,
    status: String
  },
  
  // Message status
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  deliveredTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  // Reply reference
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, createdAt: -1 });
messageSchema.index({ 'readBy.user': 1 });
messageSchema.index({ createdAt: -1 });

// Static methods
messageSchema.statics.markAsRead = async function(messageIds, userId) {
  return this.updateMany(
    { _id: { $in: messageIds }, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );
};

messageSchema.statics.markAsDelivered = async function(messageIds, userId) {
  return this.updateMany(
    { _id: { $in: messageIds }, deliveredTo: { $ne: userId } },
    { $addToSet: { deliveredTo: userId } }
  );
};

// Method to get message preview
messageSchema.methods.getPreview = function() {
  if (this.messageType === 'property' && this.sharedItem) {
    return `Shared a property: ${this.sharedItem.title}`;
  }
  if (this.messageType === 'service' && this.sharedItem) {
    return `Shared a service: ${this.sharedItem.title}`;
  }
  if (this.messageType === 'image') {
    return '📷 Image';
  }
  if (this.messageType === 'video') {
    return '🎥 Video';
  }
  if (this.messageType === 'audio') {
    return '🎵 Audio';
  }
  if (this.messageType === 'document') {
    return '📄 Document';
  }
  return this.content || '';
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;