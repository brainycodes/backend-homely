const Notification = require('../models/Notification');
const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const SavedSearch = require('../models/SavedSearch');
const EmailService = require('../services/emailService');
const mongoose = require('mongoose');

class NotificationController {
  
  // ========== HELPER METHODS ==========
  
  static getNotificationColor(type) {
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

  static getEmailPreferenceKey(type) {
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

  static getNotificationTypeLabel(type) {
    const labels = {
      'property_view': 'Property View',
      'property_save': 'Property Save',
      'property_listed': 'Property Listed',
      'service_booking': 'Service Booking',
      'service_view': 'Service View',
      'service_save': 'Service Save',
      'message_received': 'New Message',
      'review_received': 'New Review',
      'rating_received': 'New Rating',
      'saved_search_match': 'Saved Search Match',
      'system': 'System',
      'verification': 'Verification',
      'kyc_status': 'KYC Status'
    };
    return labels[type] || 'Notification';
  }

  // Helper method to calculate time ago
  static getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay}d ago`;
    if (diffHour > 0) return `${diffHour}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
  }

  // ========== MAIN API METHODS ==========
  
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
      
      // Format notifications - using static methods to avoid context issues
      const formattedNotifications = notifications.map(notification => ({
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        time: NotificationController.getTimeAgo(notification.createdAt),
        timeExact: notification.createdAt,
        data: notification.data,
        icon: null, // Will be set on frontend
        color: NotificationController.getNotificationColor(notification.type)
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
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/properties/${property._id}`
        }
      });
      
      // Schedule email notification
      await this.scheduleEmailNotification(notification);
      
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
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/properties/${property._id}`
        }
      });
      
      await this.scheduleEmailNotification(notification);
      
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
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard/bookings/${booking._id}`
        }
      });
      
      await this.scheduleEmailNotification(notification);
      
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
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/messages?conversation=${message.conversationId}`
        }
      });
      
      await this.scheduleEmailNotification(notification);
      
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
          url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/agents/${agentId}#reviews`
        }
      });
      
      await this.scheduleEmailNotification(notification);
      
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
        itemUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/properties/${propertyOrServiceId}`;
      } else {
        item = await Service.findById(propertyOrServiceId);
        itemType = 'service';
        itemUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/services/${propertyOrServiceId}`;
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
      
      await this.scheduleEmailNotification(notification);
      
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
  
  // ========== EMAIL NOTIFICATION METHODS ==========
  
  // Schedule email notification (batched approach)
  async scheduleEmailNotification(notification) {
    try {
      const FOUR_HOURS = 4 * 60 * 60 * 1000;
      
      // Check if user has email notifications enabled
      const user = await User.findById(notification.user)
        .select('notificationPreferences lastLogin');
      
      if (!user) return;
      
      // Check if email notifications are enabled
      if (!user.notificationPreferences?.email?.enabled) {
        notification.shouldEmail = false;
        await notification.save();
        return;
      }
      
      // Check user preferences for this specific type
      const preferenceKey = NotificationController.getEmailPreferenceKey(notification.type);
      if (!user.notificationPreferences?.email?.[preferenceKey]) {
        notification.shouldEmail = false;
        await notification.save();
        return;
      }
      
      // Check if user has been active in last 4 hours
      const userInactiveFor4Hours = !user.lastLogin || 
        (new Date() - new Date(user.lastLogin)) > FOUR_HOURS;
      
      if (!userInactiveFor4Hours) {
        // User has been active recently, don't schedule email
        notification.shouldEmail = false;
        await notification.save();
        return;
      }
      
      // Schedule email for 4 hours from now (to allow batching)
      const scheduleTime = new Date(Date.now() + FOUR_HOURS);
      
      notification.shouldEmail = true;
      notification.emailScheduledAt = scheduleTime;
      await notification.save();
      
      console.log(`Email scheduled for notification ${notification._id} for user ${user._id} at ${scheduleTime}`);
      
    } catch (error) {
      console.error('Error scheduling email notification:', error);
    }
  }
  
  // Process pending email notifications (batched)
  async processPendingEmailNotifications() {
    try {
      console.log('Starting batched email notification processing...');
      
      const FOUR_HOURS = 4 * 60 * 60 * 1000;
      const fourHoursAgo = new Date(Date.now() - FOUR_HOURS);
      
      // Find users who haven't logged in for 4+ hours
      const inactiveUsers = await User.aggregate([
        {
          $match: {
            $or: [
              { lastLogin: { $lt: fourHoursAgo } },
              { lastLogin: null }
            ],
            'notificationPreferences.email.enabled': true
          }
        },
        {
          $lookup: {
            from: 'notifications',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$user', '$$userId'] },
                      { $eq: ['$shouldEmail', true] },
                      { $eq: ['$emailed', false] },
                      { $lte: ['$emailScheduledAt', new Date()] }
                    ]
                  }
                }
              },
              { $sort: { createdAt: -1 } },
              { $limit: 20 } // Limit to 20 notifications per batch
            ],
            as: 'pendingNotifications'
          }
        },
        {
          $match: {
            'pendingNotifications.0': { $exists: true }
          }
        }
      ]);
      
      console.log(`Found ${inactiveUsers.length} inactive users with pending notifications`);
      
      for (const userData of inactiveUsers) {
        if (userData.pendingNotifications.length === 0) continue;
        
        // Group notifications by type
        const notificationsByType = {};
        userData.pendingNotifications.forEach(notification => {
          const type = notification.type;
          if (!notificationsByType[type]) {
            notificationsByType[type] = [];
          }
          notificationsByType[type].push(notification);
        });
        
        // Check if user has preferences enabled for these notification types
        let hasEnabledNotifications = false;
        for (const [type, notifications] of Object.entries(notificationsByType)) {
          const preferenceKey = NotificationController.getEmailPreferenceKey(type);
          if (userData.notificationPreferences?.email?.[preferenceKey]) {
            hasEnabledNotifications = true;
            break;
          }
        }
        
        if (!hasEnabledNotifications) {
          // Mark all as emailed since user doesn't want these types
          const notificationIds = userData.pendingNotifications.map(n => n._id);
          await Notification.updateMany(
            { 
              _id: { $in: notificationIds }
            },
            { 
              emailed: true,
              emailedAt: new Date(),
              shouldEmail: false
            }
          );
          continue;
        }
        
        // Send batched email
        const emailSent = await this.sendBatchedNotificationEmail(userData, userData.pendingNotifications);
        
        if (emailSent) {
          // Mark all notifications as emailed
          const notificationIds = userData.pendingNotifications.map(n => n._id);
          await Notification.updateMany(
            { 
              _id: { $in: notificationIds }
            },
            { 
              emailed: true,
              emailedAt: new Date()
            }
          );
          
          console.log(`✅ Sent batched email to ${userData.email} with ${userData.pendingNotifications.length} notifications`);
        }
      }
      
      console.log('Batched email notification processing completed.');
      
    } catch (error) {
      console.error('Error processing batched email notifications:', error);
    }
  }
  
  // Send batched notification email
  async sendBatchedNotificationEmail(user, notifications) {
    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const notificationUrl = `${baseUrl}/dashboard/notifications`;
      
      // Group notifications by type
      const notificationsByType = {};
      notifications.forEach(notification => {
        const type = notification.type;
        if (!notificationsByType[type]) {
          notificationsByType[type] = [];
        }
        notificationsByType[type].push(notification);
      });
      
      // Filter only notifications that user has enabled
      const enabledNotificationsByType = {};
      for (const [type, typeNotifications] of Object.entries(notificationsByType)) {
        const preferenceKey = NotificationController.getEmailPreferenceKey(type);
        if (user.notificationPreferences?.email?.[preferenceKey]) {
          enabledNotificationsByType[type] = typeNotifications;
        }
      }
      
      // If no enabled notifications, return false
      if (Object.keys(enabledNotificationsByType).length === 0) {
        return false;
      }
      
      // Create email template
      const emailTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Homely Notifications</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #374151; 
              background-color: #f9fafb;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            .header { 
              background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .header p {
              margin: 10px 0 0;
              font-size: 16px;
              opacity: 0.9;
            }
            .content { 
              padding: 40px 30px; 
            }
            .summary {
              background: #f3f4f6;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
              border-left: 4px solid #10b981;
            }
            .summary h2 {
              margin: 0 0 15px 0;
              font-size: 20px;
              color: #111827;
            }
            .summary p {
              margin: 0;
              color: #6b7280;
            }
            .notification-list {
              margin-bottom: 30px;
            }
            .notification { 
              background: white; 
              padding: 20px; 
              margin-bottom: 15px; 
              border-radius: 8px; 
              border-left: 4px solid #10b981; 
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              border: 1px solid #e5e7eb;
            }
            .notification h3 {
              margin: 0 0 8px 0;
              font-size: 16px;
              color: #111827;
              font-weight: 600;
            }
            .notification p {
              margin: 0 0 10px 0;
              color: #6b7280;
              font-size: 14px;
              line-height: 1.5;
            }
            .notification-time {
              color: #9ca3af;
              font-size: 12px;
              margin-top: 8px;
            }
            .button-container { 
              text-align: center; 
              margin: 30px 0; 
            }
            .button { 
              display: inline-block; 
              background: #10b981; 
              color: white; 
              padding: 14px 28px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600;
              font-size: 16px;
            }
            .footer { 
              margin-top: 40px; 
              text-align: center; 
              color: #6b7280; 
              font-size: 12px; 
              border-top: 1px solid #e5e7eb;
              padding-top: 20px;
            }
            .notification-count {
              display: inline-block;
              background: #10b981;
              color: white;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
              margin-left: 8px;
            }
            .notification-type {
              display: inline-block;
              background: #f3f4f6;
              color: #6b7280;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              margin-bottom: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Homely Notifications</h1>
              <p>Your activity summary</p>
            </div>
            <div class="content">
              <div class="summary">
                <h2>Hello ${user.firstName || 'User'},</h2>
                <p>You have ${notifications.length} new notification${notifications.length === 1 ? '' : 's'} waiting for you:</p>
              </div>
              
              <div class="notification-list">
                ${Object.entries(enabledNotificationsByType).map(([type, typeNotifications]) => `
                  <div style="margin-bottom: 25px;">
                    <h3 style="margin-bottom: 15px; color: #374151; font-size: 18px; font-weight: 600;">
                      ${NotificationController.getNotificationTypeLabel(type)}
                      <span class="notification-count">${typeNotifications.length}</span>
                    </h3>
                    ${typeNotifications.map(notification => `
                      <div class="notification">
                        <div class="notification-type">${NotificationController.getNotificationTypeLabel(notification.type)}</div>
                        <h3>${notification.title}</h3>
                        <p>${notification.message}</p>
                        <div class="notification-time">
                          ${new Date(notification.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `).join('')}
              </div>
              
              <div class="button-container">
                <a href="${notificationUrl}" class="button" style="color: white; text-decoration: none;">
                  View All Notifications
                </a>
              </div>
              
              <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px;">
                You're receiving this email because you have email notifications enabled.<br>
                <a href="${baseUrl}/dashboard/settings" style="color: #10b981; text-decoration: none;">Manage notification preferences</a>
              </p>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} Homely. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await EmailService.sendMail({
        to: user.email,
        subject: `Homely: ${notifications.length} new notification${notifications.length === 1 ? '' : 's'}`,
        html: emailTemplate
      });
      
      return true;
      
    } catch (error) {
      console.error('Error sending batched notification email:', error);
      return false;
    }
  }
}

module.exports = new NotificationController();