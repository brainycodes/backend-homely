const User = require('../models/User');
const Admin = require('../models/Admin');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class AdminUsersController {
  // Get all users with filters
  async getAllUsers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const { 
        search, 
        userType, 
        status, 
        verification, 
        kycStatus 
      } = req.query;
      
      const query = {};
      
      // Apply filters
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (userType && userType !== 'all') {
        query.userType = userType;
      }
      
      if (status && status !== 'all') {
        query.isActive = status === 'active' ? true : false;
      }
      
      if (verification && verification !== 'all') {
        query.emailVerified = verification === 'verified' ? true : false;
      }
      
      if (kycStatus && kycStatus !== 'all') {
        query['kyc.status'] = kycStatus;
      }
      
      // Get total count
      const total = await User.countDocuments(query);
      
      // Get users
      const users = await User.find(query)
        .select('-password -emailVerificationToken -emailVerificationExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Calculate KYC stats for each user
      const usersWithKYC = users.map(user => ({
        ...user,
        kyc: user.kyc || { status: 'not_submitted' }
      }));
      
      res.status(200).json({
        success: true,
        users: usersWithKYC,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
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
  
  // Get single user by ID
  async getUserById(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id)
        .select('-password -emailVerificationToken -emailVerificationExpires')
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
        const Property = require('../models/Property');
        properties = await Property.find({ postedBy: id })
          .select('title price location type status featured isVerified')
          .limit(5)
          .sort({ createdAt: -1 })
          .lean();
      }
      
      // Get user's services if house-seeker
      let services = [];
      if (user.userType === 'house-seeker') {
        const Service = require('../models/Service');
        services = await Service.find({ postedBy: id })
          .select('title price location category featured isVerified')
          .limit(5)
          .sort({ createdAt: -1 })
          .lean();
      }
      
      res.status(200).json({
        success: true,
        user: {
          ...user,
          kyc: user.kyc || { status: 'not_submitted' },
          properties,
          services
        }
      });
      
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user',
        error: error.message
      });
    }
  }
  
  // Toggle user active status
  async toggleUserStatus(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Cannot deactivate yourself
      if (user._id.toString() === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own account'
        });
      }
      
      user.isActive = !user.isActive;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive
        }
      });
      
    } catch (error) {
      console.error('Toggle user status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user status',
        error: error.message
      });
    }
  }
  
  // Create new user (admin)
  async createUser(req, res) {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        password,
        userType,
        specialization,
        experience,
        bio,
        teamSize,
        languages,
        certifications,
        autoVerifyEmail = false
      } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName || !email || !password || !userType) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all required fields: firstName, lastName, email, password, userType'
        });
      }
      
      // Validate email format
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }
      
      // Check if email already exists
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
      
      // Validate user type
      const validUserTypes = ['agent-landlord', 'house-seeker'];
      if (!validUserTypes.includes(userType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user type'
        });
      }
      
      // Create user object
      const userData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : '',
        password,
        userType,
        agreeToTerms: true,
        emailVerified: autoVerifyEmail,
        newsletter: false
      };
      
      // Add optional fields
      if (specialization) userData.specialization = specialization.trim();
      if (experience) userData.experience = experience.trim();
      if (bio) userData.bio = bio.trim();
      if (teamSize) userData.teamSize = parseInt(teamSize);
      if (languages) {
        userData.languages = Array.isArray(languages) 
          ? languages 
          : languages.split(',').map(lang => lang.trim());
      }
      if (certifications) {
        userData.certifications = Array.isArray(certifications)
          ? certifications
          : certifications.split(',').map(cert => cert.trim());
      }
      
      // Create user
      const user = await User.create(userData);
      
      // Remove sensitive data
      const userResponse = user.toJSON();
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: userResponse
      });
      
    } catch (error) {
      console.error('Create user error:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', ')
        });
      }
      
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error creating user',
        error: error.message
      });
    }
  }
  
  // Update user
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Remove fields that shouldn't be updated
      delete updates.password;
      delete updates.email;
      delete updates.emailVerified;
      delete updates.kyc;
      
      // Handle arrays
      if (updates.languages && typeof updates.languages === 'string') {
        updates.languages = updates.languages.split(',').map(lang => lang.trim());
      }
      
      if (updates.certifications && typeof updates.certifications === 'string') {
        updates.certifications = updates.certifications.split(',').map(cert => cert.trim());
      }
      
      // Handle numbers
      if (updates.teamSize) {
        updates.teamSize = parseInt(updates.teamSize);
      }
      
      // Update user
      Object.keys(updates).forEach(key => {
        user[key] = updates[key];
      });
      
      await user.save();
      
      const userResponse = user.toJSON();
      
      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        user: userResponse
      });
      
    } catch (error) {
      console.error('Update user error:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', ')
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating user',
        error: error.message
      });
    }
  }
  
  // Get user statistics
  async getUserStats(req, res) {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
            verifiedUsers: { $sum: { $cond: [{ $eq: ["$emailVerified", true] }, 1, 0] } },
            agentLandlords: { $sum: { $cond: [{ $eq: ["$userType", "agent-landlord"] }, 1, 0] } },
            houseSeekers: { $sum: { $cond: [{ $eq: ["$userType", "house-seeker"] }, 1, 0] } },
            kycPending: { $sum: { $cond: [{ $eq: ["$kyc.status", "pending"] }, 1, 0] } },
            kycApproved: { $sum: { $cond: [{ $eq: ["$kyc.status", "approved"] }, 1, 0] } },
            kycRejected: { $sum: { $cond: [{ $eq: ["$kyc.status", "rejected"] }, 1, 0] } }
          }
        }
      ]);
      
      // Get monthly signups
      const monthlySignups = await User.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $limit: 6 }
      ]);
      
      res.status(200).json({
        success: true,
        stats: stats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          verifiedUsers: 0,
          agentLandlords: 0,
          houseSeekers: 0,
          kycPending: 0,
          kycApproved: 0,
          kycRejected: 0
        },
        monthlySignups
      });
      
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user statistics',
        error: error.message
      });
    }
  }
  
  // Get all admins
  async getAllAdmins(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const { search, role, status } = req.query;
      
      const query = { userType: 'admin' };
      
      // Apply filters
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (role && role !== 'all') {
        query.role = role;
      }
      
      if (status && status !== 'all') {
        query.isActive = status === 'active' ? true : false;
      }
      
      // Get total count
      const total = await Admin.countDocuments(query);
      
      // Get admins
      const admins = await Admin.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      res.status(200).json({
        success: true,
        admins,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      console.error('Get all admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching admins',
        error: error.message
      });
    }
  }
  
  // Get single admin by ID
  async getAdminById(req, res) {
    try {
      const { id } = req.params;
      
      const admin = await Admin.findById(id)
        .select('-password')
        .lean();
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      res.status(200).json({
        success: true,
        admin
      });
      
    } catch (error) {
      console.error('Get admin by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching admin',
        error: error.message
      });
    }
  }
  
  // Update admin
  async updateAdmin(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const admin = await Admin.findById(id);
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      // Check permissions
      const isSuperAdmin = req.user.role === 'superadmin';
      const isSelf = req.user.id === id;
      
      // Non-superadmins cannot update certain fields
      if (!isSuperAdmin) {
        delete updates.role;
        delete updates.permissions;
        delete updates.isActive;
        
        // Non-superadmin can only update themselves
        if (!isSelf) {
          return res.status(403).json({
            success: false,
            message: 'Only Super Admin can update other admins'
          });
        }
      }
      
      // Super Admin cannot downgrade themselves
      if (isSuperAdmin && isSelf && updates.role && updates.role !== 'superadmin') {
        return res.status(400).json({
          success: false,
          message: 'Super Admin cannot change their own role'
        });
      }
      
      // Remove password field
      delete updates.password;
      
      // Update admin
      Object.keys(updates).forEach(key => {
        admin[key] = updates[key];
      });
      
      await admin.save();
      
      const adminResponse = admin.toJSON();
      
      res.status(200).json({
        success: true,
        message: 'Admin updated successfully',
        admin: adminResponse
      });
      
    } catch (error) {
      console.error('Update admin error:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', ')
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating admin',
        error: error.message
      });
    }
  }
  
  // Delete admin (soft delete)
  async deleteAdmin(req, res) {
    try {
      const { id } = req.params;
      
      // Cannot delete yourself
      if (req.user.id === id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }
      
      const admin = await Admin.findById(id);
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      // Soft delete by deactivating
      admin.isActive = false;
      await admin.save();
      
      res.status(200).json({
        success: true,
        message: 'Admin deactivated successfully',
        admin: {
          _id: admin._id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          isActive: admin.isActive
        }
      });
      
    } catch (error) {
      console.error('Delete admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deactivating admin',
        error: error.message
      });
    }
  }
  
  // Get pending KYC submissions
  async getPendingKYC(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      // Find users with pending KYC
      const query = {
        'kyc.status': 'pending',
        'kyc.submittedAt': { $exists: true }
      };
      
      // Get total count
      const total = await User.countDocuments(query);
      
      // Get users with pending KYC
      const users = await User.find(query)
        .select('firstName lastName email phone userType profileImage kyc createdAt')
        .sort({ 'kyc.submittedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      res.status(200).json({
        success: true,
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      console.error('Get pending KYC error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching pending KYC',
        error: error.message
      });
    }
  }
  
  // Review KYC submission
  async reviewKYC(req, res) {
    try {
      const { userId } = req.params;
      const { status, rejectionReason } = req.body;
      const adminId = req.user.id;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      if (!user.kyc || user.kyc.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'No pending KYC submission found'
        });
      }
      
      // Update KYC status
      user.kyc.status = status;
      user.kyc.reviewedAt = new Date();
      user.kyc.reviewedBy = adminId;
      
      if (status === 'rejected' && rejectionReason) {
        user.kyc.rejectionReason = rejectionReason;
      }
      
      await user.save();
      
      res.status(200).json({
        success: true,
        message: `KYC ${status} successfully`,
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          kyc: user.kyc
        }
      });
      
    } catch (error) {
      console.error('Review KYC error:', error);
      res.status(500).json({
        success: false,
        message: 'Error reviewing KYC',
        error: error.message
      });
    }
  }
}

module.exports = new AdminUsersController();