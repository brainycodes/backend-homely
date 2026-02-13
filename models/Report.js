// models/Report.js
const mongoose = require('mongoose');

// Report Reasons Schema
const reportReasonSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: [
      'spam', 'fake', 'fraud', 'misleading',
      'inappropriate', 'harassment', 'scam',
      'duplicate', 'wrong_category', 'wrong_price',
      'no_response', 'bad_service', 'other'
    ],
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  }
}, { _id: false });

// Main Report Schema
const reportSchema = new mongoose.Schema({
  // Who is reporting
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reporter is required']
  },

  // What is being reported
  targetType: {
    type: String,
    enum: ['agent', 'property', 'service'],
    required: [true, 'Target type is required']
  },

  // Target ID (agent, property, or service)
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel',
    required: [true, 'Target ID is required']
  },

  // Dynamic reference based on targetType
  targetModel: {
    type: String,
    required: true,
    enum: ['User', 'Property', 'Service']
  },

  // Target details (denormalized for performance)
  targetDetails: {
    title: { type: String, trim: true },
    provider: { type: String, trim: true },
    location: { type: String, trim: true },
    price: { type: Number },
    image: { type: String }
  },

  // Reporter details (denormalized)
  reporterDetails: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    userType: { type: String }
  },

  // Report Information
  reportReason: {
    type: reportReasonSchema,
    required: [true, 'Report reason is required']
  },

  additionalComments: {
    type: String,
    trim: true,
    maxlength: [1000, 'Comments cannot exceed 1000 characters']
  },

  // Status Management
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'dismissed'],
    default: 'pending'
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Admin Actions
  adminNotes: [{
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    note: { type: String, trim: true },
    action: {
      type: String,
      enum: ['note', 'warning', 'suspend', 'remove', 'dismiss']
    },
    createdAt: { type: Date, default: Date.now }
  }],

  // Resolution
  resolution: {
    action: {
      type: String,
      enum: ['none', 'warning', 'suspension', 'deletion', 'dismissed']
    },
    message: { type: String, trim: true },
    resolvedAt: { type: Date },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Analytics
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  },
  reportCount: {
    type: Number,
    default: 1
  },

  // Metadata
  ipAddress: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Compound indexes for performance
reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: 1, createdAt: -1 });
reportSchema.index({ 'reportReason.category': 1, status: 1 });

// Pre-save middleware to set targetModel and denormalize data
reportSchema.pre('save', async function() {
  // Set targetModel based on targetType
  if (this.targetType === 'agent') {
    this.targetModel = 'User';
  } else if (this.targetType === 'property') {
    this.targetModel = 'Property';
  } else if (this.targetType === 'service') {
    this.targetModel = 'Service';
  }

  // Update timestamps
  this.updatedAt = Date.now();
  
});

// Method to add admin note
reportSchema.methods.addAdminNote = async function(adminId, note, action = 'note') {
  this.adminNotes.push({
    admin: adminId,
    note,
    action,
    createdAt: new Date()
  });
  await this.save();
};

// Method to resolve report
reportSchema.methods.resolve = async function(adminId, action, message) {
  this.status = 'resolved';
  this.resolution = {
    action,
    message,
    resolvedAt: new Date(),
    resolvedBy: adminId
  };
  await this.save();
};

// Method to dismiss report
reportSchema.methods.dismiss = async function(adminId, reason) {
  this.status = 'dismissed';
  this.resolution = {
    action: 'dismissed',
    message: reason,
    resolvedAt: new Date(),
    resolvedBy: adminId
  };
  await this.save();
};

// Static method to check for duplicate reports
reportSchema.statics.findDuplicate = async function(reporterId, targetType, targetId, timeWindow = 24) {
  const timeLimit = new Date(Date.now() - timeWindow * 60 * 60 * 1000);
  
  return await this.findOne({
    reporter: reporterId,
    targetType,
    targetId,
    createdAt: { $gte: timeLimit },
    status: { $in: ['pending', 'investigating'] }
  });
};

// Static method to get report statistics
reportSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalReports: { $sum: 1 },
        pendingReports: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        investigatingReports: {
          $sum: { $cond: [{ $eq: ['$status', 'investigating'] }, 1, 0] }
        },
        resolvedReports: {
          $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
        },
        dismissedReports: {
          $sum: { $cond: [{ $eq: ['$status', 'dismissed'] }, 1, 0] }
        },
        urgentReports: {
          $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] }
        },
        highPriority: {
          $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
        }
      }
    }
  ]);

  const categoryStats = await this.aggregate([
    { $group: { _id: '$reportReason.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const targetTypeStats = await this.aggregate([
    { $group: { _id: '$targetType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  return {
    overview: stats[0] || {
      totalReports: 0,
      pendingReports: 0,
      investigatingReports: 0,
      resolvedReports: 0,
      dismissedReports: 0,
      urgentReports: 0,
      highPriority: 0
    },
    categoryStats,
    targetTypeStats
  };
};

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;