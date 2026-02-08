const Notification = require('../models/Notification');
const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const SavedSearch = require('../models/SavedSearch');
const EmailService = require('../services/emailService');
const mongoose = require('mongoose');

class NotificationController {
  
  // Get user notifications
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 20, 
        unreadOnly = false,
        type
      } = req.query;
      
      const skip = (page - 1) * limit;
      
      // Build query
      const query = { user: userId };
      
      if (unreadOnly === 'true') {
        query.read = false;
      }
      
      if (type && type !== 'all') {
        query.type = type;
      }
      
      // Get notifications
      const notifications = await Notification.find(query)
        .populate('data.propertyId', 'title price location images')
        .populate('data.serviceId', 'title price location category images')
        .populate('data.agentId', 'firstName lastName profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
      
      // Get unread count
      const unreadCount = await Notification.countDocuments({
        user: userId,
        read: false
      });
      
      // Get total count
      const total = await Notification.countDocuments({ user: userId });
      
      // Format notifications - FIX: Store this in a variable to use in map
      const controller = this;
      
      const formattedNotifications = notifications.map(notification => ({
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        time: notification.timeAgo,
        timeExact: notification.createdAt,
        data: notification.data,
        icon: controller.getNotificationIcon(notification.type), // Use stored reference
        color: controller.getNotificationColor(notification.type) // Use stored reference
      }));
      
      res.status(200).json({
        success: true,
        notifications: formattedNotifications,
        unreadCount,
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page)
      });
      
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching notifications'
      });
    }
  }
  
  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      // Check ownership
      if (notification.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }
      
      await notification.markAsRead();
      
      res.status(200).json({
        success: true,
        message: 'Notification marked as read'
      });
      
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Error marking notification as read'
      });
    }
  }
  
  // Mark all as read
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      
      await Notification.updateMany(
        { user: userId, read: false },
        { 
          read: true,
          readAt: new Date()
        }
      );
      
      res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
      });
      
    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Error marking notifications as read'
      });
    }
  }
  
  // Get notification count
  async getNotificationCount(req, res) {
    try {
      const userId = req.user.id;
      
      const unreadCount = await Notification.getUnreadCount(userId);
      
      // Get counts by type
      const counts = await Notification.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), read: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);
      
      const countsByType = counts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});
      
      res.status(200).json({
        success: true,
        unreadCount,
        countsByType
      });
      
    } catch (error) {
      console.error('Get notification count error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching notification count'
      });
    }
  }
  
  // Delete notification
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      // Check ownership
      if (notification.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }
      
      await notification.deleteOne();
      
      res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });
      
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting notification'
      });
    }
  }
  
  // Clear all notifications
  async clearAllNotifications(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await Notification.deleteMany({ user: userId });
      
      res.status(200).json({
        success: true,
        message: `Cleared ${result.deletedCount} notifications`
      });
      
    } catch (error) {
      console.error('Clear all notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing notifications'
      });
    }
  }
  
  // ========== NOTIFICATION CREATION METHODS ==========
  
  // Create property view notification
  async createPropertyViewNotification(propertyId, userId) {
    try {
      const property = await Property.findById(propertyId);
      if (!property) return;
      
      const notification = await Notification.createNotification({
        user: property.postedBy,
        type: 'property_view',
        title: 'New Property View',
        message: `Your property "${property.title}" got a new view`,
        data: {
          propertyId: property._id,
          url: `/properties/${property._id}`
        }
      });
      
      // Check if we should send email
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create property view notification error:', error);
    }
  }
  
  // Create property save notification
  async createPropertySaveNotification(propertyId, userId) {
    try {
      const property = await Property.findById(propertyId);
      if (!property) return;
      
      const user = await User.findById(userId);
      
      const notification = await Notification.createNotification({
        user: property.postedBy,
        type: 'property_save',
        title: 'Property Saved',
        message: `${user.firstName} ${user.lastName} saved your property "${property.title}"`,
        data: {
          propertyId: property._id,
          agentId: userId,
          url: `/properties/${property._id}`
        }
      });
      
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create property save notification error:', error);
    }
  }
  
  // Create service booking notification
  async createServiceBookingNotification(bookingId, userId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('service')
        .populate('user');
      
      if (!booking) return;
      
      const notification = await Notification.createNotification({
        user: booking.provider,
        type: 'service_booking',
        title: 'New Service Booking',
        message: `${booking.user.firstName} booked your "${booking.service.title}" service`,
        data: {
          serviceId: booking.service._id,
          bookingId: booking._id,
          agentId: userId,
          url: `/dashboard/bookings/${booking._id}`
        }
      });
      
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create service booking notification error:', error);
    }
  }
  
  // Create message notification
  async createMessageNotification(messageId, receiverId, senderId) {
    try {
      const message = await Message.findById(messageId)
        .populate('sender', 'firstName lastName');
      
      if (!message) return;
      
      const notification = await Notification.createNotification({
        user: receiverId,
        type: 'message_received',
        title: 'New Message',
        message: `New message from ${message.sender.firstName} ${message.sender.lastName}`,
        data: {
          messageId: message._id,
          agentId: senderId,
          url: `/messages?conversation=${message.conversationId}`
        }
      });
      
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create message notification error:', error);
    }
  }
  
  // Create review notification
  async createReviewNotification(ratingId, agentId) {
    try {
      const rating = await Rating.findById(ratingId)
        .populate('user', 'firstName lastName');
      
      if (!rating) return;
      
      const notification = await Notification.createNotification({
        user: agentId,
        type: 'review_received',
        title: 'New Review',
        message: `${rating.user.firstName} left you a ${rating.rating}-star review`,
        data: {
          reviewId: rating._id,
          agentId: rating.user._id,
          url: `/agents/${agentId}#reviews`
        }
      });
      
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create review notification error:', error);
    }
  }
  
  // Create saved search match notification
  async createSavedSearchMatchNotification(searchId, propertyOrServiceId, isProperty = true) {
    try {
      const search = await SavedSearch.findById(searchId);
      if (!search || !search.isActive) return;
      
      const user = await User.findOne({ email: search.email });
      if (!user) return;
      
      let item, itemType, itemUrl;
      
      if (isProperty) {
        item = await Property.findById(propertyOrServiceId);
        itemType = 'property';
        itemUrl = `/properties/${propertyOrServiceId}`;
      } else {
        item = await Service.findById(propertyOrServiceId);
        itemType = 'service';
        itemUrl = `/services/${propertyOrServiceId}`;
      }
      
      if (!item) return;
      
      const notification = await Notification.createNotification({
        user: user._id,
        type: 'saved_search_match',
        title: 'Saved Search Match',
        message: `New ${itemType} matching your search: "${search.searchQuery}"`,
        data: {
          [isProperty ? 'propertyId' : 'serviceId']: propertyOrServiceId,
          url: itemUrl,
          metadata: {
            searchType: search.searchType,
            searchQuery: search.searchQuery,
            filters: search.filters
          }
        }
      });
      
      // Update search last notified
      search.lastNotified = new Date();
      search.matchCount += 1;
      await search.save();
      
      await this.checkAndSendEmail(notification);
      
    } catch (error) {
      console.error('Create saved search match error:', error);
    }
  }
  
  // Check saved searches for new properties
  async checkSavedSearchesForProperty(propertyId) {
    try {
      const property = await Property.findById(propertyId);
      if (!property) return;
      
      // Find saved searches matching this property
      const matchingSearches = await SavedSearch.find({
        searchType: 'property',
        isActive: true,
        $or: [
          { 'filters.location': property.location },
          { 'filters.location': 'Nationwide' }
        ],
        $or: [
          { 'filters.propertyTypes': { $in: [property.type] } },
          { 'filters.propertyTypes': { $size: 0 } }
        ],
        $or: [
          {
            'filters.priceRange.0': { $lte: property.price },
            'filters.priceRange.1': { $gte: property.price }
          },
          { 'filters.priceRange': { $size: 0 } }
        ]
      });
      
      // Create notifications for each match
      for (const search of matchingSearches) {
        await this.createSavedSearchMatchNotification(
          search._id,
          propertyId,
          true
        );
      }
      
    } catch (error) {
      console.error('Check saved searches error:', error);
    }
  }
  
  // Check saved searches for new services
  async checkSavedSearchesForService(serviceId) {
    try {
      const service = await Service.findById(serviceId);
      if (!service) return;
      
      // Find saved searches matching this service
      const matchingSearches = await SavedSearch.find({
        searchType: 'service',
        isActive: true,
        $or: [
          { 'filters.location': service.location },
          { 'filters.location': 'Nationwide' }
        ],
        $or: [
          { 'filters.serviceCategories': { $in: [service.category] } },
          { 'filters.serviceCategories': { $size: 0 } }
        ],
        $or: [
          {
            'filters.priceRange.0': { $lte: service.price },
            'filters.priceRange.1': { $gte: service.price }
          },
          { 'filters.priceRange': { $size: 0 } }
        ]
      });
      
      // Create notifications for each match
      for (const search of matchingSearches) {
        await this.createSavedSearchMatchNotification(
          search._id,
          serviceId,
          false
        );
      }
      
    } catch (error) {
      console.error('Check saved searches for service error:', error);
    }
  }
  
  // Check and send email notification
  async checkAndSendEmail(notification) {
    try {
      if (!notification.shouldEmail || notification.emailed) return;
      
      const user = await User.findById(notification.user)
        .select('email firstName lastName notificationPreferences lastLogin');
      
      if (!user) return;
      
      // Check user preferences
      if (!user.notificationPreferences?.email?.[this.getEmailPreferenceKey(notification.type)]) {
        return;
      }
      
      // Check if user has been active in last 4 hours
      const FOUR_HOURS = 4 * 60 * 60 * 1000;
      const userInactiveFor4Hours = !user.lastLogin || 
        (new Date() - new Date(user.lastLogin)) > FOUR_HOURS;
      
      if (!userInactiveFor4Hours) {
        // User has been active, no need to email
        return;
      }
      
      // Send email
      const emailSent = await this.sendNotificationEmail(user, notification);
      
      if (emailSent) {
        await notification.markAsEmailed();
      }
      
    } catch (error) {
      console.error('Check and send email error:', error);
    }
  }
  
  // Send notification email
  async sendNotificationEmail(user, notification) {
    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const notificationUrl = `${baseUrl}/dashboard/notifications`;
      
      const emailTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .notification { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #10b981; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Homely Notification</h1>
              <p>You have new activity on your account</p>
            </div>
            <div class="content">
              <h2>Hello ${user.firstName},</h2>
              <p>You have a new notification:</p>
              
              <div class="notification">
                <h3>${notification.title}</h3>
                <p>${notification.message}</p>
                <p><small>Received: ${new Date(notification.createdAt).toLocaleString()}</small></p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${notification.data?.url || notificationUrl}" class="button">
                  View ${notification.data?.url ? 'Details' : 'Notifications'}
                </a>
              </div>
              
              <p>If the button doesn't work, copy and paste this link in your browser:</p>
              <p><a href="${notification.data?.url || notificationUrl}">${notification.data?.url || notificationUrl}</a></p>
              
              <div class="footer">
                <p>This email was sent to ${user.email} because you have email notifications enabled.</p>
                <p>To manage your notification preferences, visit your account settings.</p>
                <p>© ${new Date().getFullYear()} Homely. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await EmailService.sendMail({
        to: user.email,
        subject: `Homely: ${notification.title}`,
        html: emailTemplate
      });
      
      return true;
      
    } catch (error) {
      console.error('Send notification email error:', error);
      return false;
    }
  }
  
  // Process pending email notifications (to be run as a cron job)
  async processPendingEmailNotifications() {
    try {
      const pendingNotifications = await Notification.find({
        shouldEmail: true,
        emailed: false,
        emailScheduledAt: { $lte: new Date() }
      }).limit(50);
      
      for (const notification of pendingNotifications) {
        await this.checkAndSendEmail(notification);
      }
      
      console.log(`Processed ${pendingNotifications.length} pending email notifications`);
      
    } catch (error) {
      console.error('Process pending email notifications error:', error);
    }
  }
  
  // Helper methods
  getNotificationIcon(type) {
    const icons = {
      'property_view': '👁️',
      'property_save': '💾',
      'property_listed': '🏠',
      'service_booking': '📅',
      'service_view': '👁️',
      'service_save': '💾',
      'message_received': '✉️',
      'review_received': '⭐',
      'rating_received': '👍',
      'saved_search_match': '🔍',
      'system': '⚙️',
      'verification': '✅',
      'kyc_status': '📋'
    };
    return icons[type] || '🔔';
  }
  
  getNotificationColor(type) {
    const colors = {
      'property_view': 'blue',
      'property_save': 'green',
      'property_listed': 'emerald',
      'service_booking': 'purple',
      'service_view': 'blue',
      'service_save': 'green',
      'message_received': 'indigo',
      'review_received': 'yellow',
      'rating_received': 'amber',
      'saved_search_match': 'teal',
      'system': 'gray',
      'verification': 'green',
      'kyc_status': 'blue'
    };
    return colors[type] || 'gray';
  }
  
  getEmailPreferenceKey(type) {
    const mapping = {
      'property_view': 'newProperties',
      'property_save': 'newProperties',
      'property_listed': 'newProperties',
      'service_booking': 'newServices',
      'service_view': 'newServices',
      'service_save': 'newServices',
      'message_received': 'newMessages',
      'review_received': 'reviews',
      'rating_received': 'reviews',
      'saved_search_match': 'savedMatches',
      'system': 'system',
      'verification': 'system',
      'kyc_status': 'system'
    };
    return mapping[type] || 'system';
  }
}

module.exports = new NotificationController();