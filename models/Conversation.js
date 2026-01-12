const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  
  // For property-related conversations
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  },
  
  // For service-related conversations
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  
  // Last message info
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageText: String,
  lastMessageType: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'document', 'property', 'service']
  },
  lastMessageSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastMessageTime: Date,
  
  // Unread counts per user
  unreadCounts: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  
  // Conversation metadata
  isArchived: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  mutedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    until: Date
  }],
  
  // Custom conversation name
  name: String,
  avatar: String,
  isGroup: {
    type: Boolean,
    default: false
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'participants.user': 1, updatedAt: -1 });
conversationSchema.index({ lastMessageTime: -1 });
conversationSchema.index({ property: 1 });
conversationSchema.index({ service: 1 });

// Methods
conversationSchema.methods.getUnreadCount = function(userId) {
  const unread = this.unreadCounts.find(uc => uc.user.toString() === userId.toString());
  return unread ? unread.count : 0;
};

conversationSchema.methods.incrementUnreadCounts = function(senderId) {
  this.participants.forEach(participantId => {
    if (participantId.toString() !== senderId.toString()) {
      const unreadIndex = this.unreadCounts.findIndex(uc => 
        uc.user.toString() === participantId.toString()
      );
      
      if (unreadIndex >= 0) {
        this.unreadCounts[unreadIndex].count += 1;
      } else {
        this.unreadCounts.push({
          user: participantId,
          count: 1
        });
      }
    }
  });
  return this.save();
};

conversationSchema.methods.resetUnreadCount = function(userId) {
  const unreadIndex = this.unreadCounts.findIndex(uc => 
    uc.user.toString() === userId.toString()
  );
  
  if (unreadIndex >= 0) {
    this.unreadCounts[unreadIndex].count = 0;
    return this.save();
  }
  return this;
};

// Static method to find or create conversation
conversationSchema.statics.findOrCreate = async function(participantIds, options = {}) {
  const sortedParticipants = [...new Set(participantIds)].sort();
  
  let conversation = await this.findOne({
    participants: { $all: sortedParticipants, $size: sortedParticipants.length },
    isGroup: false
  }).populate('participants', 'firstName lastName email profileImage userType');
  
  if (!conversation) {
    conversation = new this({
      participants: sortedParticipants,
      property: options.property,
      service: options.service,
      unreadCounts: sortedParticipants.map(userId => ({
        user: userId,
        count: 0
      }))
    });
    await conversation.save();
  }
  
  // Ensure participants are always populated
  if (!conversation.populated('participants')) {
    conversation = await this.findById(conversation._id)
      .populate('participants', 'firstName lastName email profileImage userType')
      .populate('property', 'title price location images')
      .populate('service', 'title price location category images');
  }
  
  return conversation;
};
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;