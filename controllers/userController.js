const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const Saved = require('../models/Saved');
const Rating = require('../models/Rating'); // Add this import
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
            serviceProviderUsers: { $sum: { $cond: [{ $eq: ["$userType", "house-seeker"] }, 1, 0] } },
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
      
      // Get user's services if house-seeker
      let services = [];
      if (user.userType === 'house-seeker') {
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
      
      if (user.userType === 'house-seeker') {
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
      
      // Delete user's services if house-seeker
      if (user.userType === 'house-seeker') {
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

  // Add deleteRating method
  async deleteRating(req, res) {
    try {
      const { id: agentId } = req.params;
      const userId = req.user.id;

      // Find and delete the rating
      const rating = await Rating.findOneAndDelete({
        user: userId,
        ratedUser: agentId
      });

      if (!rating) {
        return res.status(404).json({
          success: false,
          message: 'Rating not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Rating deleted successfully'
      });

    } catch (error) {
      console.error('Delete rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting rating',
        error: error.message
      });
    }
  }
  
// Update getAllAgents to include ratings
  async getAllAgents(req, res) {
    try {
      console.log('Getting all agents with query:', req.query);
      
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const filters = req.query;
      const query = {
        isActive: true
      };
      
      // Apply userType filter
      if (filters.userType) {
        if (filters.userType.includes(',')) {
          const userTypes = filters.userType.split(',');
          query.userType = { $in: userTypes };
        } else {
          query.userType = filters.userType;
        }
      } else {
        // Default: get both agent-landlord and house-seeker
        query.userType = { $in: ['agent-landlord', 'house-seeker'] };
      }
      
      if (filters.specialization) {
        query.specialization = { $regex: filters.specialization, $options: 'i' };
      }
      
      if (filters.search) {
        query.$or = [
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
          { specialization: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Filter by minimum rating if specified
      if (filters.minRating) {
        query.rating = { $gte: parseFloat(filters.minRating) };
      }
      
      console.log('Final query:', query);
      
      // Get total count
      const total = await User.countDocuments(query);
      
      // Get agents with sorting
      let sortCriteria = { createdAt: -1 };
      if (filters.sortBy === 'rating') {
        sortCriteria = { rating: -1, createdAt: -1 };
      } else if (filters.sortBy === 'newest') {
        sortCriteria = { createdAt: -1 };
      } else if (filters.sortBy === 'name') {
        sortCriteria = { firstName: 1, lastName: 1 };
      }
      
      const agents = await User.find(query)
        .select('-password -__v')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean();
      
      console.log('Found agents:', agents.length);
      
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
          
          if (agent.userType === 'house-seeker') {
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
          
          return {
            ...agent,
            stats,
            // Use the rating from the user document
            rating: agent.rating || 0,
            totalRatings: agent.totalRatings || 0
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
  
// Enhanced getAgentReviews method
  async getAgentReviews(req, res) {
    try {
      const { id: agentId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const ratingFilter = req.query.rating || 'all';
      const sortBy = req.query.sortBy || 'newest';
      
      // Check if agent exists
      const agent = await User.findById(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }
      
      // Build query
      const query = { ratedUser: agentId };
      
      // Apply rating filter
      if (ratingFilter !== 'all') {
        const rating = parseInt(ratingFilter);
        if (rating === 5) {
          query.rating = 5;
        } else if (rating >= 1 && rating <= 4) {
          query.rating = { $gte: rating };
        }
      }
      
      // Build sort
      let sort = { createdAt: -1 }; // Default: newest first
      
      switch (sortBy) {
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'highest':
          sort = { rating: -1, createdAt: -1 };
          break;
        case 'lowest':
          sort = { rating: 1, createdAt: -1 };
          break;
        case 'most_helpful':
          // Assuming we have a likes field
          sort = { likes: -1, createdAt: -1 };
          break;
      }
      
      // Get reviews with pagination
      const reviews = await Rating.find(query)
        .populate('user', 'firstName lastName profileImage emailVerified')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Get total count
      const total = await Rating.countDocuments(query);
      
      // Get average rating and distribution
      const ratingStats = await Rating.aggregate([
        { $match: { ratedUser: new mongoose.Types.ObjectId(agentId) } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
            ratingDistribution: {
              $push: '$rating'
            }
          }
        }
      ]);
      
      // Calculate distribution
      const distribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      };
      
      if (ratingStats.length > 0 && ratingStats[0].ratingDistribution) {
        ratingStats[0].ratingDistribution.forEach(rating => {
          if (rating >= 1 && rating <= 5) {
            const star = Math.floor(rating);
            distribution[star] = (distribution[star] || 0) + 1;
          }
        });
      }
      
      const averageRating = ratingStats.length > 0 
        ? ratingStats[0].averageRating || 0 
        : 0;
      
      res.status(200).json({
        success: true,
        reviews,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalRatings: ratingStats.length > 0 ? ratingStats[0].totalRatings || 0 : 0,
        ratingDistribution: distribution
      });
      
    } catch (error) {
      console.error('Get agent reviews error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching reviews',
        error: error.message
      });
    }
  }

  // Add a method to get user's rating for an agent
  async getUserRating(req, res) {
    try {
      const { id: agentId } = req.params;
      const userId = req.user.id;
      
      const rating = await Rating.findOne({
        user: userId,
        ratedUser: agentId
      });
      
      res.status(200).json({
        success: true,
        rating: rating ? {
          rating: rating.rating,
          review: rating.review,
          createdAt: rating.createdAt
        } : null
      });
      
    } catch (error) {
      console.error('Get user rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user rating',
        error: error.message
      });
    }
  }


// Update getAgentById to include ratings
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
      if (!['agent-landlord', 'house-seeker'].includes(agent.userType)) {
        return res.status(400).json({
          success: false,
          message: 'User is not an agent'
        });
      }
      
      // Get agent's properties (check both postedBy and agent.id)
      const propertyQuery = {
        $or: [
          { postedBy: agent._id },
          { 'agent.id': agent._id }
        ],
        isActive: true,
        isVerified: true
      };
      
      const properties = await Property.find(propertyQuery)
        .select('title price location type status featured isVerified images rating views saves bedrooms bathrooms area')
        .sort({ featured: -1, createdAt: -1 })
        .limit(10)
        .lean();
      
      // Get agent's services (check both postedBy and provider.id)
      const serviceQuery = {
        $or: [
          { postedBy: agent._id },
          { 'provider.id': agent._id }
        ],
        isActive: true,
        isVerified: true
      };
      
      const services = await Service.find(serviceQuery)
        .select('title price location category featured isVerified images rating views saves completedJobs experienceLevel pricingType insurance')
        .sort({ featured: -1, createdAt: -1 })
        .limit(10)
        .lean();
      
      // Get agent stats
      let stats = {};
      
      if (agent.userType === 'agent-landlord') {
        const propertyStats = await Property.aggregate([
          { $match: propertyQuery },
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
      
      if (agent.userType === 'house-seeker') {
        const serviceStats = await Service.aggregate([
          { $match: serviceQuery },
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
      
      // Calculate combined rating from properties and services
      const allRatings = [
        ...(properties.map(p => p.rating || 0)),
        ...(services.map(s => s.rating || 0))
      ].filter(r => r > 0);
      
      // Get user's rating if logged in
      let userRating = null;
      if (req.user) {
        const rating = await Rating.findOne({
          user: req.user.id,
          ratedUser: agent._id
        });
        
        if (rating) {
          userRating = {
            rating: rating.rating,
            review: rating.review,
            createdAt: rating.createdAt
          };
        }
      }
      
      // Get recent reviews
      const recentReviews = await Rating.find({ ratedUser: agent._id })
        .populate('user', 'firstName lastName profileImage')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      
      // Get rating distribution
      const ratingDistribution = await Rating.aggregate([
        { $match: { ratedUser: agent._id } },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } }
      ]);
      
      // Create rating distribution object
      const distribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      };
      
      ratingDistribution.forEach(item => {
        distribution[item._id] = item.count;
      });
      
      res.status(200).json({
        success: true,
        agent: {
          ...agent,
          properties,
          services,
          stats: {
            ...stats,
            propertiesPosted: properties.length,
            servicesPosted: services.length,
            totalViews: (stats.totalViews || 0) + (stats.totalViews || 0),
            totalSaves: (stats.totalSaves || 0) + (stats.totalSaves || 0),
            totalRatings: agent.totalRatings || 0
          },
          rating: agent.rating || 0,
          userRating, // Add current user's rating
          recentReviews, // Add recent reviews
          ratingDistribution: distribution // Add rating distribution
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

      if (user.userType === 'house-seeker') {
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

  // Update saveProperty method to use Saved model
async saveProperty(req, res) {
  try {
    const userId = req.user.id;
    const { propertyId } = req.body;

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check if already saved using Saved model
    const existingSave = await Saved.findOne({
      user: userId,
      itemType: 'property',
      property: propertyId
    });

    let isSaved;
    if (existingSave) {
      // Remove from saved
      await Saved.findByIdAndDelete(existingSave._id);
      await Property.findByIdAndUpdate(propertyId, { $inc: { saves: -1 } });
      isSaved = false;
    } else {
      // Add to saved
      const savedItem = new Saved({
        user: userId,
        itemType: 'property',
        property: propertyId
      });
      await savedItem.save();
      await Property.findByIdAndUpdate(propertyId, { $inc: { saves: 1 } });
      isSaved = true;
    }

    res.status(200).json({
      success: true,
      message: isSaved ? 'Property saved successfully' : 'Property removed from saved',
      isSaved
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

// Update saveService method to use Saved model
async saveService(req, res) {
  try {
    const userId = req.user.id;
    const { serviceId } = req.body;

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if already saved using Saved model
    const existingSave = await Saved.findOne({
      user: userId,
      itemType: 'service',
      service: serviceId
    });

    let isSaved;
    if (existingSave) {
      // Remove from saved
      await Saved.findByIdAndDelete(existingSave._id);
      await Service.findByIdAndUpdate(serviceId, { $inc: { saves: -1 } });
      isSaved = false;
    } else {
      // Add to saved
      const savedItem = new Saved({
        user: userId,
        itemType: 'service',
        service: serviceId
      });
      await savedItem.save();
      await Service.findByIdAndUpdate(serviceId, { $inc: { saves: 1 } });
      isSaved = true;
    }

    res.status(200).json({
      success: true,
      message: isSaved ? 'Service saved successfully' : 'Service removed from saved',
      isSaved
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

// Update getSavedItems method to use Saved model
async getSavedItems(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await Saved.getUserSavedItems(userId, { limit: 12 });

    res.status(200).json({
      success: true,
      savedProperties: result.items.filter(item => item.type === 'property'),
      savedServices: result.items.filter(item => item.type === 'service'),
      total: result.total
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

// Update the rateAgent method
  async rateAgent(req, res) {
    try {
      const { rating, review } = req.body;
      const { id: agentId } = req.params;
      const userId = req.user.id;

      // Validation
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }

      const agent = await User.findById(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found'
        });
      }

      // Check if user is trying to rate themselves
      if (agentId === userId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot rate yourself'
        });
      }

      // Check if user already rated this agent
      const existingRating = await Rating.findOne({
        user: userId,
        ratedUser: agentId
      });

      if (existingRating) {
        // Update existing rating
        existingRating.rating = rating;
        existingRating.review = review || existingRating.review;
        await existingRating.save();
        
        const message = review ? 'Rating and review updated successfully' : 'Rating updated successfully';
        
        // Get updated agent data
        const updatedAgent = await User.findById(agentId);
        
        return res.status(200).json({
          success: true,
          message,
          rating: updatedAgent.rating,
          totalRatings: updatedAgent.totalRatings
        });
      }

      // Create new rating
      const newRating = new Rating({
        user: userId,
        ratedUser: agentId,
        rating,
        review: review || ''
      });

      await newRating.save();

      // Get updated agent data
      const updatedAgent = await User.findById(agentId);

      res.status(201).json({
        success: true,
        message: 'Rating submitted successfully',
        rating: updatedAgent.rating,
        totalRatings: updatedAgent.totalRatings
      });

    } catch (error) {
      console.error('Rate agent error:', error);
      
      // Handle duplicate rating error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'You have already rated this agent'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error submitting rating',
        error: error.message
      });
    }
  }


// Add endpoint for saving users
async saveUser(req, res) {
  try {
    const { userId, notes } = req.body;
    const currentUserId = req.user.id;

    const userToSave = await User.findById(userId);
    if (!userToSave) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already saved
    const existingSave = await Saved.findOne({
      user: currentUserId,
      itemType: 'user',
      userSaved: userId
    });

    if (existingSave) {
      return res.status(400).json({
        success: false,
        message: 'User is already saved'
      });
    }

    // Create saved item
    const savedItem = new Saved({
      user: currentUserId,
      itemType: 'user',
      userSaved: userId,
      notes: notes || '',
      savedAt: new Date()
    });

    await savedItem.save();

    res.status(201).json({
      success: true,
      message: 'User saved successfully',
      savedItem
    });

  } catch (error) {
    console.error('Save user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving user',
      error: error.message
    });
  }
}
}

module.exports = new UserController();