const Service = require('../models/Service');
const User = require('../models/User');
const Booking = require('../models/Booking');
const moment = require('moment');

class AdminServiceController {
  // @desc    Get all services with filters (admin)
  // @route   GET /api/admin/services
  // @access  Private (Admin with manageServices permission)
  async getAllServices(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to manage services'
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;

      // Build query
      const query = {};

      // Apply filters
      if (req.query.category && req.query.category !== 'all') query.category = req.query.category;
      if (req.query.location && req.query.location !== 'all') query.location = req.query.location;
      if (req.query.experienceLevel && req.query.experienceLevel !== 'all') {
        query.experienceLevel = req.query.experienceLevel;
      }
      if (req.query.isVerified === 'true') query.isVerified = true;
      if (req.query.isVerified === 'false') query.isVerified = false;
      if (req.query.featured === 'true') query.featured = true;
      if (req.query.featured === 'false') query.featured = false;
      if (req.query.isActive === 'true') query.isActive = true;
      if (req.query.isActive === 'false') query.isActive = false;
      
      // Search functionality
      if (req.query.search) {
        query.$or = [
          { title: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
          { 'provider.name': { $regex: req.query.search, $options: 'i' } },
          { tags: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      const services = await Service.find(query)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .sort({ featured: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Service.countDocuments(query);

      // Format services
      const formattedServices = services.map(service => {
        const serviceObj = service.toObject();
        
        return {
          ...serviceObj,
          createdAtFormatted: moment(service.createdAt).fromNow(),
          updatedAtFormatted: moment(service.updatedAt).fromNow()
        };
      });

      res.json({
        success: true,
        data: formattedServices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get all services error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Get pending services (not verified or not active)
  // @route   GET /api/admin/services/pending
  // @access  Private (Admin with manageServices permission)
  async getPendingServices(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to manage services'
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Find services that are not verified OR not active
      const query = {
        $or: [
          { isVerified: false },
          { isActive: false }
        ]
      };

      // Apply filters if provided
      if (req.query.category) query.category = req.query.category;
      if (req.query.location) query.location = req.query.location;
      
      // Search functionality
      if (req.query.search) {
        query.$or = [
          { title: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
          { 'provider.name': { $regex: req.query.search, $options: 'i' } }
        ];
      }

      const services = await Service.find(query)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Service.countDocuments(query);

      // Calculate statistics
      const stats = {
        pending: await Service.countDocuments({ 
          $or: [
            { isVerified: false },
            { isActive: false }
          ]
        }),
        inactive: await Service.countDocuments({ isActive: false }),
        unverified: await Service.countDocuments({ isVerified: false }),
        featured: await Service.countDocuments({ featured: true }),
        total: total
      };

      // Format services
      const formattedServices = services.map(service => {
        const serviceObj = service.toObject();
        
        return {
          ...serviceObj,
          createdAtFormatted: moment(service.createdAt).fromNow(),
          updatedAtFormatted: moment(service.updatedAt).fromNow()
        };
      });

      res.json({
        success: true,
        data: formattedServices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        stats
      });

    } catch (error) {
      console.error('Get pending services error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Get pending service by ID
  // @route   GET /api/admin/services/pending/:id
  // @access  Private (Admin with manageServices permission)
  async getPendingServiceById(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to manage services'
        });
      }

      const service = await Service.findById(req.params.id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .populate('reviews.user', 'firstName lastName');

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        data: service
      });

    } catch (error) {
      console.error('Get pending service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Approve service (and optionally mark as featured)
  // @route   PUT /api/admin/services/:id/approve
  // @access  Private (Admin with manageServices permission)
  async approveService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to approve services'
        });
      }

      const { verificationNotes, makeFeatured = true } = req.body;

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Update service
      service.isVerified = true;
      service.isActive = true;
      
      // Automatically mark as featured when approving (default is true)
      service.featured = makeFeatured;
      
      if (verificationNotes) {
        service.verificationNotes = verificationNotes;
      }
      
      service.verifiedAt = new Date();
      await service.save();

      // Populate before sending response
      const populatedService = await Service.findById(service._id)
        .populate('postedBy', 'firstName lastName email phone')
        .populate('provider.id', 'firstName lastName email phone profileImage');

      res.json({
        success: true,
        message: `Service approved successfully${makeFeatured ? ' and marked as featured' : ''}`,
        data: populatedService
      });

    } catch (error) {
      console.error('Approve service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Decline/Reject service
  // @route   PUT /api/admin/services/:id/decline
  // @access  Private (Admin with manageServices permission)
  async declineService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to decline services'
        });
      }

      const { reason } = req.body;

      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a reason for declining (minimum 5 characters)'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Update service
      service.isActive = false;
      service.verificationNotes = `Declined: ${reason.trim()}`;
      service.featured = false; // Ensure declined services are not featured
      
      await service.save();

      res.json({
        success: true,
        message: 'Service declined successfully',
        data: {
          id: service._id,
          isActive: service.isActive,
          verificationNotes: service.verificationNotes
        }
      });

    } catch (error) {
      console.error('Decline service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Request changes for service
  // @route   PUT /api/admin/services/:id/request-changes
  // @access  Private (Admin with manageServices permission)
  async requestServiceChanges(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to request service changes'
        });
      }

      const { changesRequested } = req.body;

      if (!changesRequested || changesRequested.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Please provide detailed changes requested (minimum 10 characters)'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Update service with changes requested
      service.verificationNotes = `Changes Requested: ${changesRequested.trim()}`;
      
      await service.save();

      res.json({
        success: true,
        message: 'Changes requested successfully',
        data: {
          id: service._id,
          verificationNotes: service.verificationNotes
        }
      });

    } catch (error) {
      console.error('Request changes error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Get service statistics
  // @route   GET /api/admin/services/stats
  // @access  Private (Admin with manageServices permission)
  async getServiceStats(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view service stats'
        });
      }

      const stats = {
        total: await Service.countDocuments(),
        verified: await Service.countDocuments({ isVerified: true }),
        unverified: await Service.countDocuments({ isVerified: false }),
        active: await Service.countDocuments({ isActive: true }),
        inactive: await Service.countDocuments({ isActive: false }),
        featured: await Service.countDocuments({ featured: true }),
        pendingReview: await Service.countDocuments({ 
          $or: [
            { isVerified: false },
            { isActive: false }
          ]
        }),
        byCategory: await Service.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        byLocation: await Service.aggregate([
          { $group: { _id: '$location', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        byExperienceLevel: await Service.aggregate([
          { $group: { _id: '$experienceLevel', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get service stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Get featured services stats
  // @route   GET /api/admin/services/featured-stats
  // @access  Private (Admin with manageServices permission)
  async getFeaturedStats(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view service stats'
      });
    }

      const stats = {
        totalFeatured: await Service.countDocuments({ featured: true }),
        activeFeatured: await Service.countDocuments({ featured: true, isActive: true }),
        byCategory: await Service.aggregate([
          { $match: { featured: true } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        byLocation: await Service.aggregate([
          { $match: { featured: true } },
          { $group: { _id: '$location', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).then(results => results.map(item => ({
          location: item._id,
          count: item.count
        })))
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get featured stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Verify service
  // @route   PUT /api/admin/services/:id/verify
  // @access  Private (Admin with manageServices permission)
  async verifyService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to verify services'
        });
      }

      const { verificationNotes } = req.body;

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isVerified = true;
      service.verifiedAt = new Date();
      if (verificationNotes) {
        service.verificationNotes = verificationNotes;
      }
      
      await service.save();

      res.json({
        success: true,
        message: 'Service verified successfully',
        data: service
      });

    } catch (error) {
      console.error('Verify service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Unverify service
  // @route   PUT /api/admin/services/:id/unverify
  // @access  Private (Admin with manageServices permission)
  async unverifyService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to unverify services'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isVerified = false;
      service.verificationNotes = `Unverified by admin on ${new Date().toLocaleDateString()}`;
      
      await service.save();

      res.json({
        success: true,
        message: 'Service unverified successfully',
        data: service
      });

    } catch (error) {
      console.error('Unverify service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Activate service
  // @route   PUT /api/admin/services/:id/activate
  // @access  Private (Admin with manageServices permission)
  async activateService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to activate services'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isActive = true;
      
      await service.save();

      res.json({
        success: true,
        message: 'Service activated successfully',
        data: service
      });

    } catch (error) {
      console.error('Activate service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Deactivate service
  // @route   PUT /api/admin/services/:id/deactivate
  // @access  Private (Admin with manageServices permission)
  async deactivateService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to deactivate services'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.isActive = false;
      
      await service.save();

      res.json({
        success: true,
        message: 'Service deactivated successfully',
        data: service
      });

    } catch (error) {
      console.error('Deactivate service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Toggle service featured status
  // @route   PUT /api/admin/services/:id/toggle-featured
  // @access  Private (Admin with manageServices permission)
  async toggleFeatured(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to toggle featured status'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      service.featured = !service.featured;
      
      await service.save();

      res.json({
        success: true,
        message: service.featured ? 'Service featured successfully' : 'Service unfeatured successfully',
        data: service
      });

    } catch (error) {
      console.error('Toggle featured error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Get single service by ID (admin)
  // @route   GET /api/admin/services/:id
  // @access  Private (Admin with manageServices permission)
  async getServiceById(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view service details'
        });
      }

      const service = await Service.findById(req.params.id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .populate('reviews.user', 'firstName lastName');

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        data: service
      });

    } catch (error) {
      console.error('Get service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Update service (admin)
  // @route   PUT /api/admin/services/:id
  // @access  Private (Admin with manageServices permission)
  async updateService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update services'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Update service data
      const updateData = req.body;
      
      // Convert string arrays to arrays
      if (req.body.servicesIncluded) {
        updateData.servicesIncluded = Array.isArray(req.body.servicesIncluded)
          ? updateData.servicesIncluded
          : req.body.servicesIncluded.split(',').map(item => item.trim());
      }
      
      if (req.body.tags) {
        updateData.tags = Array.isArray(req.body.tags)
          ? updateData.tags
          : req.body.tags.split(',').map(item => item.trim());
      }
      
      if (req.body.serviceAreas) {
        updateData.serviceAreas = Array.isArray(req.body.serviceAreas)
          ? updateData.serviceAreas
          : req.body.serviceAreas.split(',').map(item => item.trim());
      }
      
      if (req.body.languages) {
        updateData['provider.languages'] = Array.isArray(req.body.languages)
          ? req.body.languages
          : req.body.languages.split(',').map(item => item.trim());
      }
      
      if (req.body.certifications) {
        updateData['provider.certifications'] = Array.isArray(req.body.certifications)
          ? req.body.certifications
          : req.body.certifications.split(',').map(item => item.trim());
      }

      // Parse packages if provided
      if (req.body.packages) {
        try {
          updateData.packages = JSON.parse(req.body.packages);
        } catch (error) {
          console.error('Error parsing packages:', error);
          updateData.packages = [];
        }
      }

      // Parse numbers
      if (req.body.price) updateData.price = parseFloat(req.body.price);
      if (req.body.completedJobs) updateData.completedJobs = parseInt(req.body.completedJobs);
      if (req.body.teamSize) updateData['provider.teamSize'] = parseInt(req.body.teamSize);
      if (req.body.rating) updateData.rating = parseFloat(req.body.rating);

      const updatedService = await Service.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('postedBy', 'firstName lastName email phone userType')
      .populate('provider.id', 'firstName lastName email phone profileImage');

      res.json({
        success: true,
        message: 'Service updated successfully',
        data: updatedService
      });

    } catch (error) {
      console.error('Update service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // @desc    Delete service (admin)
  // @route   DELETE /api/admin/services/:id
  // @access  Private (Admin with manageServices permission)
  async deleteService(req, res) {
    try {
      // Check if user has permission
      if (!req.user.permissions?.manageServices && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete services'
        });
      }

      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Delete images from Cloudinary if needed
      if (service.images && service.images.length > 0) {
        // Add Cloudinary deletion logic here if needed
        console.log('Service images would be deleted from Cloudinary');
      }

      await Service.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Service deleted successfully'
      });

    } catch (error) {
      console.error('Delete service error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
}

module.exports = new AdminServiceController();