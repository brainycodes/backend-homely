const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

class UserController {
  // Get all users (admin only)
  async getAllUsers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const filters = req.query;
      const query = {};
      
      // Apply filters
      if (filters.userType) query.userType = filters.userType;
      if (filters.search) {
        query.$or = [
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Get total count
      const total = await User.countDocuments(query);
      
      // Get users
      const users = await User.find(query)
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      // Get user stats
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
            verifiedUsers: { $sum: { $cond: [{ $eq: ["$emailVerified", true] }, 1, 0] } },
            adminUsers: { $sum: { $cond: [{ $eq: ["$userType", "admin"] }, 1, 0] } },
            agentLandlordUsers: { $sum: { $cond: [{ $eq: ["$userType", "agent-landlord"] }, 1, 0] } },
            serviceProviderUsers: { $sum: { $cond: [{ $eq: ["$userType", "service-provider"] }, 1, 0] } },
            buyerRenterUsers: { $sum: { $cond: [{ $eq: ["$userType", "buyer-renter"] }, 1, 0] } }
          }
        }
      ]);
      
      res.status(200).json({
        success: true,
        users,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        stats: stats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          verifiedUsers: 0,
          adminUsers: 0,
          agentLandlordUsers: 0,
          serviceProviderUsers: 0,
          buyerRenterUsers: 0
        }
      });
      
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching users',
        error: error.message
      });
    }
  }
  
  // Get user profile
  async getUserProfile(req, res) {
    try {
      const userId = req.params.id || req.user.id;
      const user = await User.findById(userId)
        .select('-password -__v')
        .lean();
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Get user's properties if agent-landlord
      let properties = [];
      if (user.userType === 'agent-landlord') {
        properties = await Property.find({ postedBy: userId })
          .select('title price location type status featured isVerified images')
          .limit(6)
          .sort({ createdAt: -1 })
          .lean();
      }
      
      // Get user's services if service-provider
      let services = [];
      if (user.userType === 'service-provider') {
        services = await Service.find({ postedBy: userId })
          .select('title price location category featured isVerified images')
          .limit(6)
          .sort({ createdAt: -1 })
          .lean();
      }
      
      // Get saved properties and services
      const savedProperties = await Property.find({ _id: { $in: user.savedProperties || [] } })
        .select('title price location type status images')
        .limit(6)
        .lean();
      
      const savedServices = await Service.find({ _id: { $in: user.savedServices || [] } })
        .select('title price location category images')
        .limit(6)
        .lean();
      
      // Get user stats
      let stats = {};
      
      if (user.userType === 'agent-landlord') {
        const propertyStats = await Property.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              totalProperties: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
              verifiedCount: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);
        
        stats = propertyStats[0] || {
          totalProperties: 0,
          totalViews: 0,
          totalSaves: 0,
          featuredCount: 0,
          verifiedCount: 0
        };
      }
      
      if (user.userType === 'service-provider') {
        const serviceStats = await Service.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              totalServices: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              totalCompletedJobs: { $sum: "$completedJobs" },
              featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
              verifiedCount: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);
        
        stats = serviceStats[0] || {
          totalServices: 0,
          totalViews: 0,
          totalSaves: 0,
          totalCompletedJobs: 0,
          featuredCount: 0,
          verifiedCount: 0
        };
      }
      
      res.status(200).json({
        success: true,
        user: {
          ...user,
          properties,
          services,
          savedProperties,
          savedServices,
          stats
        }
      });
      
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user profile',
        error: error.message
      });
    }
  }
  
  // Update user profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const userId = req.params.id || req.user.id;
      const updateData = req.body;
      
      // Remove fields that shouldn't be updated
      delete updateData.email;
      delete updateData.password;
      delete updateData.userType;
      delete updateData.emailVerified;
      delete updateData.isActive;
      
      // Handle profile image if provided
      if (req.file) {
        updateData.profileImage = req.file.path;
      }
      
      // Convert string arrays to arrays
      if (updateData.languages) {
        updateData.languages = Array.isArray(updateData.languages)
          ? updateData.languages
          : updateData.languages.split(',').map(item => item.trim());
      }
      
      if (updateData.certifications) {
        updateData.certifications = Array.isArray(updateData.certifications)
          ? updateData.certifications
          : updateData.certifications.split(',').map(item => item.trim());
      }
      
      // Parse numbers
      if (updateData.teamSize) {
        updateData.teamSize = parseInt(updateData.teamSize);
      }
      
      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password -__v');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user
      });
      
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }
  
  // Change password
  async changePassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);
      
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Check if new password is same as current
      const isSame = await user.comparePassword(newPassword);
      if (isSame) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from current password'
        });
      }
      
      // Update password
      user.password = newPassword;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
      
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Error changing password',
        error: error.message
      });
    }
  }
  
  // Delete user account
  async deleteAccount(req, res) {
    try {
      const userId = req.params.id || req.user.id;
      
      // Check if user is deleting their own account or is admin
      if (userId !== req.user.id && req.user.userType !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this account'
        });
      }
      
      const user = await User.findByIdAndDelete(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Delete user's properties if agent-landlord
      if (user.userType === 'agent-landlord') {
        await Property.deleteMany({ postedBy: userId });
      }
      
      // Delete user's services if service-provider
      if (user.userType === 'service-provider') {
        await Service.deleteMany({ postedBy: userId });
      }
      
      res.status(200).json({
        success: true,
        message: 'Account deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting account',
        error: error.message
      });
    }
  }
  
  // Get all agents (agent-landlord and service-provider)
  async getAllAgents(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const filters = req.query;
      const query = {
        $or: [
          { userType: 'agent-landlord' },
          { userType: 'service-provider' }
        ],
        isActive: true
      };
      
      // Apply filters
      if (filters.userType && filters.userType !== 'all') {
        query.$or = [{ userType: filters.userType }];
      }
      
      if (filters.specialization) {
        query.specialization = { $regex: filters.specialization, $options: 'i' };
      }
      
      if (filters.location) {
        // This would need a more complex query if location is stored
        // For now, we'll handle it in the client
      }
      
      if (filters.search) {
        query.$or = [
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
          { specialization: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Get total count
      const total = await User.countDocuments(query);
      
      // Get agents with stats
      const agents = await User.find(query)
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Get stats for each agent
      const agentsWithStats = await Promise.all(
        agents.map(async (agent) => {
          let stats = {};
          
          if (agent.userType === 'agent-landlord') {
            const propertyStats = await Property.aggregate([
              { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
              {
                $group: {
                  _id: null,
                  totalProperties: { $sum: 1 },
                  totalViews: { $sum: "$views" },
                  totalSaves: { $sum: "$saves" },
                  featuredCount: { $sum: { $cond: ["$featured", 1, 0] } }
                }
              }
            ]);
            
            stats = propertyStats[0] || {
              totalProperties: 0,
              totalViews: 0,
              totalSaves: 0,
              featuredCount: 0
            };
          }
          
          if (agent.userType === 'service-provider') {
            const serviceStats = await Service.aggregate([
              { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
              {
                $group: {
                  _id: null,
                  totalServices: { $sum: 1 },
                  totalViews: { $sum: "$views" },
                  totalSaves: { $sum: "$saves" },
                  totalCompletedJobs: { $sum: "$completedJobs" },
                  featuredCount: { $sum: { $cond: ["$featured", 1, 0] } }
                }
              }
            ]);
            
            stats = serviceStats[0] || {
              totalServices: 0,
              totalViews: 0,
              totalSaves: 0,
              totalCompletedJobs: 0,
              featuredCount: 0
            };
          }
          
          // Calculate average rating from properties/services
          let rating = 4.5; // Default
          if (agent.userType === 'agent-landlord') {
            const propertyRating = await Property.aggregate([
              { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
              { $group: { _id: null, avgRating: { $avg: "$rating" } } }
            ]);
            
            if (propertyRating[0] && propertyRating[0].avgRating) {
              rating = propertyRating[0].avgRating;
            }
          }
          
          if (agent.userType === 'service-provider') {
            const serviceRating = await Service.aggregate([
              { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
              { $group: { _id: null, avgRating: { $avg: "$rating" } } }
            ]);
            
            if (serviceRating[0] && serviceRating[0].avgRating) {
              rating = serviceRating[0].avgRating;
            }
          }
          
          return {
            ...agent,
            stats,
            rating: parseFloat(rating.toFixed(1))
          };
        })
      );
      
      res.status(200).json({
        success: true,
        agents: agentsWithStats,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get all agents error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching agents',
        error: error.message
      });
    }
  }
  
  // Get agent profile by ID
  async getAgentById(req, res) {
    try {
      const agent = await User.findById(req.params.id)
        .select('-password -__v')
        .lean();
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }
      
      // Check if user is an agent
      if (!['agent-landlord', 'service-provider'].includes(agent.userType)) {
        return res.status(400).json({
          success: false,
          message: 'User is not an agent'
        });
      }
      
      // Get agent's properties or services
      let listings = [];
      if (agent.userType === 'agent-landlord') {
        listings = await Property.find({ postedBy: agent._id })
          .select('title price location type status featured isVerified images rating views saves')
          .sort({ featured: -1, createdAt: -1 })
          .limit(10)
          .lean();
      } else if (agent.userType === 'service-provider') {
        listings = await Service.find({ postedBy: agent._id })
          .select('title price location category featured isVerified images rating views saves completedJobs')
          .sort({ featured: -1, createdAt: -1 })
          .limit(10)
          .lean();
      }
      
      // Get agent stats
      let stats = {};
      if (agent.userType === 'agent-landlord') {
        const propertyStats = await Property.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
          {
            $group: {
              _id: null,
              totalProperties: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              avgRating: { $avg: "$rating" },
              featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
              verifiedCount: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);
        
        stats = propertyStats[0] || {
          totalProperties: 0,
          totalViews: 0,
          totalSaves: 0,
          avgRating: 0,
          featuredCount: 0,
          verifiedCount: 0
        };
      }
      
      if (agent.userType === 'service-provider') {
        const serviceStats = await Service.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(agent._id) } },
          {
            $group: {
              _id: null,
              totalServices: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              totalCompletedJobs: { $sum: "$completedJobs" },
              avgRating: { $avg: "$rating" },
              featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
              verifiedCount: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);
        
        stats = serviceStats[0] || {
          totalServices: 0,
          totalViews: 0,
          totalSaves: 0,
          totalCompletedJobs: 0,
          avgRating: 0,
          featuredCount: 0,
          verifiedCount: 0
        };
      }
      
      // Calculate rating
      const rating = stats.avgRating ? parseFloat(stats.avgRating.toFixed(1)) : 4.5;
      
      res.status(200).json({
        success: true,
        agent: {
          ...agent,
          listings,
          stats,
          rating
        }
      });
      
    } catch (error) {
      console.error('Get agent by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching agent',
        error: error.message
      });
    }
  }
  
  // Toggle user active status (admin only)
  async toggleActiveStatus(req, res) {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      user.isActive = !user.isActive;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
        user
      });
      
    } catch (error) {
      console.error('Toggle active status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling active status',
        error: error.message
      });
    }
  }

  // Save property
  async saveProperty(req, res) {
    try {
      const userId = req.user.id;
      const { propertyId } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      // Check if property is already saved
      const isSaved = user.savedProperties.includes(propertyId);
      
      if (isSaved) {
        // Remove from saved
        user.savedProperties = user.savedProperties.filter(id => id.toString() !== propertyId);
        property.saves = Math.max(0, property.saves - 1);
      } else {
        // Add to saved
        user.savedProperties.push(propertyId);
        property.saves = (property.saves || 0) + 1;
      }

      await user.save();
      await property.save();

      res.status(200).json({
        success: true,
        message: isSaved ? 'Property removed from saved' : 'Property saved successfully',
        saved: !isSaved
      });

    } catch (error) {
      console.error('Save property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving property',
        error: error.message
      });
    }
  }

  // Save service
  async saveService(req, res) {
    try {
      const userId = req.user.id;
      const { serviceId } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Check if service is already saved
      const isSaved = user.savedServices.includes(serviceId);
      
      if (isSaved) {
        // Remove from saved
        user.savedServices = user.savedServices.filter(id => id.toString() !== serviceId);
        service.saves = Math.max(0, service.saves - 1);
      } else {
        // Add to saved
        user.savedServices.push(serviceId);
        service.saves = (service.saves || 0) + 1;
      }

      await user.save();
      await service.save();

      res.status(200).json({
        success: true,
        message: isSaved ? 'Service removed from saved' : 'Service saved successfully',
        saved: !isSaved
      });

    } catch (error) {
      console.error('Save service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving service',
        error: error.message
      });
    }
  }

  // Get saved items
  async getSavedItems(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId)
        .select('savedProperties savedServices')
        .populate({
          path: 'savedProperties',
          select: 'title price location type status images rating views'
        })
        .populate({
          path: 'savedServices',
          select: 'title price location category images rating views completedJobs'
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        savedProperties: user.savedProperties || [],
        savedServices: user.savedServices || []
      });

    } catch (error) {
      console.error('Get saved items error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching saved items',
        error: error.message
      });
    }
  }

  // Get user dashboard stats
  async getDashboardStats(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      let stats = {};
      let listings = [];

      if (user.userType === 'agent-landlord') {
        // Property agent stats
        const propertyStats = await Property.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              active: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
              sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
              rented: { $sum: { $cond: [{ $eq: ["$status", "rented"] }, 1, 0] } },
              featured: { $sum: { $cond: ["$featured", 1, 0] } },
              verified: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);

        listings = await Property.find({ postedBy: userId })
          .select('title price location type status featured images createdAt')
          .sort({ createdAt: -1 })
          .limit(5);

        stats = propertyStats[0] || {
          total: 0,
          totalViews: 0,
          totalSaves: 0,
          active: 0,
          sold: 0,
          rented: 0,
          featured: 0,
          verified: 0
        };
      }

      if (user.userType === 'service-provider') {
        // Service provider stats
        const serviceStats = await Service.aggregate([
          { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalViews: { $sum: "$views" },
              totalSaves: { $sum: "$saves" },
              totalCompletedJobs: { $sum: "$completedJobs" },
              active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
              inactive: { $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] } },
              featured: { $sum: { $cond: ["$featured", 1, 0] } },
              verified: { $sum: { $cond: ["$isVerified", 1, 0] } }
            }
          }
        ]);

        listings = await Service.find({ postedBy: userId })
          .select('title price location category featured images createdAt status')
          .sort({ createdAt: -1 })
          .limit(5);

        stats = serviceStats[0] || {
          total: 0,
          totalViews: 0,
          totalSaves: 0,
          totalCompletedJobs: 0,
          active: 0,
          inactive: 0,
          featured: 0,
          verified: 0
        };
      }

      if (user.userType === 'buyer-renter') {
        // Buyer/renter stats
        const savedPropertiesCount = user.savedProperties?.length || 0;
        const savedServicesCount = user.savedServices?.length || 0;

        // Get recently viewed (would need a separate collection for this)
        // For now, return basic stats
        stats = {
          savedProperties: savedPropertiesCount,
          savedServices: savedServicesCount,
          inquiries: 0,
          appointments: 0
        };
      }

      // Get recent notifications (simplified)
      const recentActivities = [
        {
          type: 'profile_update',
          message: 'Your profile was updated',
          date: new Date(Date.now() - 86400000) // 1 day ago
        },
        {
          type: 'listing_added',
          message: 'New listing added',
          date: new Date(Date.now() - 172800000) // 2 days ago
        }
      ];

      res.status(200).json({
        success: true,
        stats,
        recentListings: listings,
        recentActivities
      });

    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard stats',
        error: error.message
      });
    }
  }
}

module.exports = new UserController();