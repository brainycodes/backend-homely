// controllers/reportController.js
const Report = require('../models/Report');
const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const timeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

class ReportController {

  calculatePriority(category) {
    const urgentCategories = ['fraud', 'scam', 'harassment'];
    const highCategories = ['fake', 'misleading', 'inappropriate'];
    
    if (urgentCategories.includes(category)) return 'urgent';
    if (highCategories.includes(category)) return 'high';
    return 'medium';
  }

  /**
   * Create a new report
   * POST /api/reports
   */
    async createReport(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
            }

            const { targetType, targetId, reportReason, additionalComments } = req.body;
            const userId = req.user.id;

            // Check if user is trying to report themselves (for agents)
            if (targetType === 'agent' && targetId === userId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot report yourself'
            });
            }

            // Check for duplicate report within 24 hours
            const existingReport = await Report.findDuplicate(userId, targetType, targetId);
            
            if (existingReport) {
            existingReport.reportCount += 1;
            await existingReport.save();

            return res.status(200).json({
                success: true,
                message: 'Your report has been submitted successfully',
                report: existingReport,
                isDuplicate: true
            });
            }

            // Get reporter details
            const reporter = await User.findById(userId);
            if (!reporter) {
            return res.status(404).json({
                success: false,
                message: 'Reporter not found'
            });
            }

            // Get target details based on type and set targetModel
            let targetDetails = {};
            let target;
            let targetModel = '';

            if (targetType === 'agent') {
            target = await User.findById(targetId);
            if (!target) {
                return res.status(404).json({
                success: false,
                message: 'Agent not found'
                });
            }
            targetModel = 'User'; // Set targetModel for agent
            targetDetails = {
                title: `${target.firstName} ${target.lastName}`,
                provider: target.userType === 'agent-landlord' ? 'Agent/Landlord' : 'Service Provider',
                location: target.specialization || '',
                image: target.profileImage || ''
            };
            } else if (targetType === 'property') {
            target = await Property.findById(targetId)
                .populate('postedBy', 'firstName lastName');
            if (!target) {
                return res.status(404).json({
                success: false,
                message: 'Property not found'
                });
            }
            targetModel = 'Property'; // Set targetModel for property
            targetDetails = {
                title: target.title,
                provider: target.agent?.name || `${target.postedBy?.firstName} ${target.postedBy?.lastName}`,
                location: target.location,
                price: target.price,
                image: target.images?.[0]?.url || ''
            };
            } else if (targetType === 'service') {
            target = await Service.findById(targetId)
                .populate('postedBy', 'firstName lastName');
            if (!target) {
                return res.status(404).json({
                success: false,
                message: 'Service not found'
                });
            }
            targetModel = 'Service'; // Set targetModel for service
            targetDetails = {
                title: target.title,
                provider: target.provider?.name || `${target.postedBy?.firstName} ${target.postedBy?.lastName}`,
                location: target.location,
                price: target.price,
                image: target.images?.[0]?.url || ''
            };
            }

            // Calculate priority
            let priority = 'medium';
            const urgentCategories = ['fraud', 'scam', 'harassment'];
            const highCategories = ['fake', 'misleading', 'inappropriate'];
            
            if (urgentCategories.includes(reportReason.category)) {
            priority = 'urgent';
            } else if (highCategories.includes(reportReason.category)) {
            priority = 'high';
            }

            // Create new report with ALL required fields
            const reportData = {
            reporter: userId,
            targetType,
            targetId,
            targetModel, // IMPORTANT: This is required by your schema
            reportReason: {
                category: reportReason.category,
                description: reportReason.description || ''
            },
            additionalComments: additionalComments || '',
            targetDetails,
            reporterDetails: {
                name: `${reporter.firstName} ${reporter.lastName}`,
                email: reporter.email,
                userType: reporter.userType
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            priority
            };

            const report = new Report(reportData);
            await report.save();

            res.status(201).json({
            success: true,
            message: 'Report submitted successfully',
            report
            });

        } catch (error) {
            console.error('Create report error:', error);
            res.status(500).json({
            success: false,
            message: 'Error submitting report',
            error: error.message
            });
        }
    }

  /**
   * Get reports submitted by current user
   * GET /api/reports/my-reports
   */
    async getMyReports(req, res) {
        try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const userId = req.user.id;

        const query = { reporter: userId };
        
        if (req.query.status) query.status = req.query.status;
        if (req.query.targetType) query.targetType = req.query.targetType;

        const total = await Report.countDocuments(query);
        
        const reports = await Report.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Use the standalone timeAgo function
        const formattedReports = reports.map(report => ({
            ...report.toObject(),
            createdAtFormatted: timeAgo(report.createdAt),
            updatedAtFormatted: timeAgo(report.updatedAt)
        }));

        res.status(200).json({
            success: true,
            reports: formattedReports,
            total,
            pages: Math.ceil(total / limit),
            currentPage: page
        });

        } catch (error) {
        console.error('Get my reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching your reports',
            error: error.message
        });
        }
    }



  /**
   * Get single report by ID
   * GET /api/reports/:id
   */
  async getReportById(req, res) {
    try {
      const report = await Report.findById(req.params.id)
        .populate('reporter', 'firstName lastName email userType profileImage')
        .populate('resolution.resolvedBy', 'firstName lastName')
        .populate('adminNotes.admin', 'firstName lastName');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      // Check if user is authorized (reporter or admin)
      if (report.reporter._id.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this report'
        });
      }

      res.status(200).json({
        success: true,
        report: {
          ...report.toObject(),
          createdAtFormatted: this.timeAgo(report.createdAt)
        }
      });

    } catch (error) {
      console.error('Get report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching report',
        error: error.message
      });
    }
  }

  /**
   * Get all reports (admin only)
   * GET /api/admin/reports
   */
  async getAllReports(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      const query = {};
      
      // Apply filters
      if (req.query.status) query.status = req.query.status;
      if (req.query.targetType) query.targetType = req.query.targetType;
      if (req.query.priority) query.priority = req.query.priority;
      if (req.query.category) query['reportReason.category'] = req.query.category;
      
      // Search
      if (req.query.search) {
        query.$or = [
          { 'targetDetails.title': { $regex: req.query.search, $options: 'i' } },
          { 'targetDetails.provider': { $regex: req.query.search, $options: 'i' } },
          { 'reporterDetails.name': { $regex: req.query.search, $options: 'i' } },
          { 'reporterDetails.email': { $regex: req.query.search, $options: 'i' } }
        ];
      }

      // Date range
      if (req.query.fromDate || req.query.toDate) {
        query.createdAt = {};
        if (req.query.fromDate) query.createdAt.$gte = new Date(req.query.fromDate);
        if (req.query.toDate) query.createdAt.$lte = new Date(req.query.toDate);
      }

      // Sort options
      let sort = { priority: -1, createdAt: -1 };
      if (req.query.sortBy) {
        switch (req.query.sortBy) {
          case 'newest':
            sort = { createdAt: -1 };
            break;
          case 'oldest':
            sort = { createdAt: 1 };
            break;
          case 'priority':
            sort = { priority: -1, createdAt: -1 };
            break;
          case 'status':
            sort = { status: 1, createdAt: -1 };
            break;
        }
      }

      const total = await Report.countDocuments(query);
      
      const reports = await Report.find(query)
        .populate('reporter', 'firstName lastName email userType profileImage')
        .populate('resolution.resolvedBy', 'firstName lastName')
        .populate('adminNotes.admin', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get all reports error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching reports',
        error: error.message
      });
    }
  }

  /**
   * Update report status (admin only)
   * PATCH /api/admin/reports/:id/status
   */
  async updateReportStatus(req, res) {
    try {
      const { status, priority, adminNote } = req.body;
      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      // Update status
      if (status) {
        report.status = status;
        
        // Add note
        if (adminNote) {
          report.adminNotes.push({
            admin: req.user.id,
            note: adminNote,
            action: 'status_update',
            createdAt: new Date()
          });
        }
      }

      // Update priority
      if (priority) {
        report.priority = priority;
      }

      await report.save();

      res.status(200).json({
        success: true,
        message: 'Report updated successfully',
        report
      });

    } catch (error) {
      console.error('Update report status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating report',
        error: error.message
      });
    }
  }

  /**
   * Resolve report (admin only)
   * POST /api/admin/reports/:id/resolve
   */
  async resolveReport(req, res) {
    try {
      const { action, message } = req.body;
      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      await report.resolve(req.user.id, action, message);

      res.status(200).json({
        success: true,
        message: 'Report resolved successfully',
        report
      });

    } catch (error) {
      console.error('Resolve report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error resolving report',
        error: error.message
      });
    }
  }

  /**
   * Dismiss report (admin only)
   * POST /api/admin/reports/:id/dismiss
   */
  async dismissReport(req, res) {
    try {
      const { reason } = req.body;
      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      await report.dismiss(req.user.id, reason);

      res.status(200).json({
        success: true,
        message: 'Report dismissed successfully',
        report
      });

    } catch (error) {
      console.error('Dismiss report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error dismissing report',
        error: error.message
      });
    }
  }

  /**
   * Add admin note to report
   * POST /api/admin/reports/:id/notes
   */
  async addAdminNote(req, res) {
    try {
      const { note, action = 'note' } = req.body;
      const report = await Report.findById(req.params.id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      await report.addAdminNote(req.user.id, note, action);

      res.status(200).json({
        success: true,
        message: 'Note added successfully',
        adminNotes: report.adminNotes
      });

    } catch (error) {
      console.error('Add admin note error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding note',
        error: error.message
      });
    }
  }

  /**
   * Get report statistics (admin only)
   * GET /api/admin/reports/stats/overview
   */
  async getReportStats(req, res) {
    try {
      const stats = await Report.getStats();

      // Get daily report counts for the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const dailyStats = await Report.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            count: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            resolved: {
              $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
            }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } }
      ]);

      res.status(200).json({
        success: true,
        stats,
        dailyStats
      });

    } catch (error) {
      console.error('Get report stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching report statistics',
        error: error.message
      });
    }
  }

  /**
   * Bulk action on multiple reports (admin only)
   * POST /api/admin/reports/bulk
   */
  async bulkAction(req, res) {
    try {
      const { reportIds, action, adminNote } = req.body;

      if (!reportIds || !reportIds.length) {
        return res.status(400).json({
          success: false,
          message: 'No reports selected'
        });
      }

      let updateData = {};

      switch (action) {
        case 'mark_investigating':
          updateData.status = 'investigating';
          break;
        case 'mark_resolved':
          updateData.status = 'resolved';
          updateData.resolution = {
            action: 'bulk_resolved',
            message: adminNote || 'Bulk resolved',
            resolvedAt: new Date(),
            resolvedBy: req.user.id
          };
          break;
        case 'mark_dismissed':
          updateData.status = 'dismissed';
          updateData.resolution = {
            action: 'bulk_dismissed',
            message: adminNote || 'Bulk dismissed',
            resolvedAt: new Date(),
            resolvedBy: req.user.id
          };
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid action'
          });
      }

      // Add admin note to all reports
      if (adminNote) {
        updateData.$push = {
          adminNotes: {
            admin: req.user.id,
            note: adminNote,
            action: 'bulk_action',
            createdAt: new Date()
          }
        };
      }

      const result = await Report.updateMany(
        { _id: { $in: reportIds } },
        updateData,
        { multi: true }
      );

      res.status(200).json({
        success: true,
        message: `Updated ${result.modifiedCount} reports`,
        modifiedCount: result.modifiedCount
      });

    } catch (error) {
      console.error('Bulk action error:', error);
      res.status(500).json({
        success: false,
        message: 'Error performing bulk action',
        error: error.message
      });
    }
  }

  /**
   * Warn user (admin only)
   * POST /api/admin/users/:userId/warn
   */
  async warnUser(req, res) {
    try {
      const { userId } = req.params;
      const { adminNote } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Add warning to user (add warnings field to User schema if not exists)
      user.warnings = (user.warnings || 0) + 1;
      user.lastWarningDate = new Date();
      user.warningReason = adminNote || 'Violation of community guidelines';
      
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Warning issued successfully',
        user: {
          _id: user._id,
          warnings: user.warnings,
          lastWarningDate: user.lastWarningDate
        }
      });

    } catch (error) {
      console.error('Warn user error:', error);
      res.status(500).json({
        success: false,
        message: 'Error issuing warning',
        error: error.message
      });
    }
  }

  /**
   * Suspend user account (admin only)
   * POST /api/admin/users/:userId/suspend
   */
  async suspendUser(req, res) {
    try {
      const { userId } = req.params;
      const { adminNote, duration = 7 } = req.body; // duration in days

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Calculate suspension end date
      const suspendedUntil = new Date();
      suspendedUntil.setDate(suspendedUntil.getDate() + duration);

      user.isActive = false;
      user.suspendedUntil = suspendedUntil;
      user.suspensionReason = adminNote || 'Violation of community guidelines';
      user.suspendedBy = req.user.id;
      user.suspendedAt = new Date();

      await user.save();

      res.status(200).json({
        success: true,
        message: `User suspended for ${duration} days`,
        user: {
          _id: user._id,
          isActive: user.isActive,
          suspendedUntil: user.suspendedUntil,
          suspensionReason: user.suspensionReason
        }
      });

    } catch (error) {
      console.error('Suspend user error:', error);
      res.status(500).json({
        success: false,
        message: 'Error suspending user',
        error: error.message
      });
    }
  }

  /**
   * Ban user permanently (admin only)
   * POST /api/admin/users/:userId/ban
   */
  async banUser(req, res) {
    try {
      const { userId } = req.params;
      const { adminNote } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      user.isActive = false;
      user.isBanned = true;
      user.bannedAt = new Date();
      user.bannedBy = req.user.id;
      user.banReason = adminNote || 'Permanent ban for severe violation';

      // Deactivate all user's listings
      if (user.userType === 'agent-landlord') {
        await Property.updateMany(
          { postedBy: userId },
          { isActive: false, isVerified: false }
        );
      } else if (user.userType === 'house-seeker') {
        await Service.updateMany(
          { postedBy: userId },
          { isActive: false, isVerified: false }
        );
      }

      await user.save();

      res.status(200).json({
        success: true,
        message: 'User banned permanently',
        user: {
          _id: user._id,
          isActive: user.isActive,
          isBanned: user.isBanned,
          banReason: user.banReason
        }
      });

    } catch (error) {
      console.error('Ban user error:', error);
      res.status(500).json({
        success: false,
        message: 'Error banning user',
        error: error.message
      });
    }
  }

  /**
   * Remove property listing (admin only)
   * POST /api/admin/properties/:propertyId/remove
   */
  async removeProperty(req, res) {
    try {
      const { propertyId } = req.params;
      const { adminNote } = req.body;

      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      property.isActive = false;
      property.isVerified = false;
      property.removedAt = new Date();
      property.removedBy = req.user.id;
      property.removalReason = adminNote || 'Violation of community guidelines';

      await property.save();

      res.status(200).json({
        success: true,
        message: 'Property removed successfully',
        property: {
          _id: property._id,
          isActive: property.isActive,
          removalReason: property.removalReason
        }
      });

    } catch (error) {
      console.error('Remove property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing property',
        error: error.message
      });
    }
  }

  /**
   * Unverify property (admin only)
   * POST /api/admin/properties/:propertyId/unverify
   */
  async unverifyProperty(req, res) {
    try {
      const { propertyId } = req.params;
      const { adminNote } = req.body;

      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      property.isVerified = false;
      property.verificationNotes = adminNote || 'Verification revoked by admin';
      property.unverifiedAt = new Date();
      property.unverifiedBy = req.user.id;

      await property.save();

      res.status(200).json({
        success: true,
        message: 'Property unverified successfully',
        property: {
          _id: property._id,
          isVerified: property.isVerified
        }
      });

    } catch (error) {
      console.error('Unverify property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error unverifying property',
        error: error.message
      });
    }
  }

  /**
   * Remove service listing (admin only)
   * POST /api/admin/services/:serviceId/remove
   */
  async removeService(req, res) {
    try {
      const { serviceId } = req.params;
      const { adminNote } = req.body;

      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isActive = false;
      service.isVerified = false;
      service.removedAt = new Date();
      service.removedBy = req.user.id;
      service.removalReason = adminNote || 'Violation of community guidelines';

      await service.save();

      res.status(200).json({
        success: true,
        message: 'Service removed successfully',
        service: {
          _id: service._id,
          isActive: service.isActive,
          removalReason: service.removalReason
        }
      });

    } catch (error) {
      console.error('Remove service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing service',
        error: error.message
      });
    }
  }

  /**
   * Unverify service (admin only)
   * POST /api/admin/services/:serviceId/unverify
   */
  async unverifyService(req, res) {
    try {
      const { serviceId } = req.params;
      const { adminNote } = req.body;

      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isVerified = false;
      service.verificationNotes = adminNote || 'Verification revoked by admin';
      service.unverifiedAt = new Date();
      service.unverifiedBy = req.user.id;

      await service.save();

      res.status(200).json({
        success: true,
        message: 'Service unverified successfully',
        service: {
          _id: service._id,
          isVerified: service.isVerified
        }
      });

    } catch (error) {
      console.error('Unverify service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error unverifying service',
        error: error.message
      });
    }
  }

  /**
   * Export reports (admin only)
   * GET /api/admin/reports/export
   */
  async exportReports(req, res) {
    try {
      const reports = await Report.find({})
        .populate('reporter', 'firstName lastName email')
        .populate('resolution.resolvedBy', 'firstName lastName')
        .sort({ createdAt: -1 });

      // Format reports for CSV
      const csvData = reports.map(report => ({
        'Report ID': report._id,
        'Reporter Name': report.reporterDetails?.name || '',
        'Reporter Email': report.reporterDetails?.email || '',
        'Target Type': report.targetType,
        'Target Title': report.targetDetails?.title || '',
        'Target Provider': report.targetDetails?.provider || '',
        'Category': report.reportReason?.category || '',
        'Description': report.reportReason?.description || '',
        'Status': report.status,
        'Priority': report.priority,
        'Created At': new Date(report.createdAt).toLocaleString(),
        'Resolved At': report.resolution?.resolvedAt ? new Date(report.resolution.resolvedAt).toLocaleString() : '',
        'Resolution Action': report.resolution?.action || '',
        'Report Count': report.reportCount
      }));

      res.status(200).json({
        success: true,
        data: csvData
      });

    } catch (error) {
      console.error('Export reports error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting reports',
        error: error.message
      });
    }
  }

  /**
   * Take action on reported target
   */
  async takeActionOnTarget(targetType, targetId, action, message) {
    try {
      if (targetType === 'agent') {
        const user = await User.findById(targetId);
        if (user) {
          if (action === 'warning') {
            user.warnings = (user.warnings || 0) + 1;
          } else if (action === 'suspension') {
            user.isActive = false;
          } else if (action === 'deletion') {
            user.isActive = false;
          }
          await user.save();
        }
      } else if (targetType === 'property') {
        const property = await Property.findById(targetId);
        if (property) {
          if (action === 'deletion') {
            property.isActive = false;
            await property.save();
          }
        }
      } else if (targetType === 'service') {
        const service = await Service.findById(targetId);
        if (service) {
          if (action === 'deletion') {
            service.isActive = false;
            await service.save();
          }
        }
      }
    } catch (error) {
      console.error('Take action on target error:', error);
    }
  }

  /**
   * Utility: Format time ago
   */
  timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    return `${Math.floor(seconds / 2592000)}mo ago`;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Get report reasons by category
   */
  getReportReasons(req, res) {
    const reasons = {
      spam: { label: 'Spam', description: 'Unsolicited or repetitive content' },
      fake: { label: 'Fake', description: 'Fake or fraudulent listing' },
      fraud: { label: 'Fraud', description: 'Scam or fraudulent activity' },
      misleading: { label: 'Misleading', description: 'Misleading information' },
      inappropriate: { label: 'Inappropriate', description: 'Inappropriate content' },
      harassment: { label: 'Harassment', description: 'Harassment or bullying' },
      scam: { label: 'Scam', description: 'Scam or phishing attempt' },
      duplicate: { label: 'Duplicate', description: 'Duplicate listing' },
      wrong_category: { label: 'Wrong Category', description: 'Incorrect category' },
      wrong_price: { label: 'Wrong Price', description: 'Incorrect pricing' },
      no_response: { label: 'No Response', description: 'Not responding to inquiries' },
      bad_service: { label: 'Bad Service', description: 'Poor service quality' },
      other: { label: 'Other', description: 'Other issue' }
    };

    // Group by target type
    const agentReasons = ['fake', 'fraud', 'harassment', 'no_response', 'other'];
    const propertyReasons = ['spam', 'fake', 'fraud', 'misleading', 'duplicate', 'wrong_category', 'wrong_price', 'other'];
    const serviceReasons = ['spam', 'fake', 'fraud', 'misleading', 'duplicate', 'wrong_category', 'wrong_price', 'no_response', 'bad_service', 'other'];

    res.status(200).json({
      success: true,
      reasons,
      byTargetType: {
        agent: agentReasons,
        property: propertyReasons,
        service: serviceReasons
      }
    });
  }
}

module.exports = new ReportController();