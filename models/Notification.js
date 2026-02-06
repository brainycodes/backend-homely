const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'property_view',
      'property_save',
      'property_listed',
      'service_booking',
      'service_view',
      'service_save',
      'message_received',
      'review_received',
      'rating_received',
      'saved_search_match',
      'system',
      'verification',
      'kyc_status'
    ]
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    // Flexible data storage for different notification types
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rating' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    url: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  emailed: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  emailedAt: {
    type: Date
  },
  // For scheduling email notifications
  shouldEmail: {
    type: Boolean,
    default: false
  },
  emailScheduledAt: {
    type: Date
  },
  // Expiry for auto-cleanup
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: { expires: 0 } // TTL index
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ 'data.propertyId': 1 });
notificationSchema.index({ 'data.serviceId': 1 });
notificationSchema.index({ shouldEmail: 1, emailed: false });

// Virtual for formatted time
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
});

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    user: userId,
    read: false
  });
};

// Static method to create notification with smart email scheduling
notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  
  // Check if user has been active in last 4 hours
  const User = mongoose.model('User');
  const user = await User.findById(data.user).select('lastLogin');
  
  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  const userInactiveFor4Hours = !user?.lastLogin || 
    (new Date() - new Date(user.lastLogin)) > FOUR_HOURS;
  
  // Schedule email if user inactive for 4+ hours
  if (userInactiveFor4Hours) {
    notification.shouldEmail = true;
    notification.emailScheduledAt = new Date();
  }
  
  await notification.save();
  return notification;
};

// Method to mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  await this.save();
};

// Method to mark as emailed
notificationSchema.methods.markAsEmailed = async function() {
  this.emailed = true;
  this.emailedAt = new Date();
  await this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;