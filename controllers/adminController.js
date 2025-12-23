const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// @desc    Login admin
// @route   POST /api/admin/login
// @access  Public
exports.loginAdmin = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    console.log('Admin login attempt:', { email });

    // Find admin by email (including password field)
    const admin = await Admin.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('+password');

    if (!admin) {
      console.log('Admin not found for email:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      console.log('Admin account inactive:', email);
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact Super Admin.'
      });
    }

    // Check password
    const isPasswordMatch = await admin.comparePassword(password);
    if (!isPasswordMatch) {
      console.log('Invalid password for admin:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    admin.lastLogin = Date.now();
    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: admin._id, 
        role: admin.role,
        userType: admin.userType,
        email: admin.email 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Prepare admin data for response (without password)
    const adminData = {
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,
      permissions: admin.permissions,
      userType: admin.userType,
      isActive: admin.isActive,
      lastLogin: admin.lastLogin,
      createdAt: admin.createdAt
    };

    console.log('Admin login successful:', {
      id: admin._id,
      name: `${admin.firstName} ${admin.lastName}`,
      role: admin.role
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        admin: adminData,
        token
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Register new admin
// @route   POST /api/admin/register
// @access  Private (Super Admin only)
exports.registerAdmin = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      password, 
      role, 
      permissions 
    } = req.body;

    console.log('Admin registration request:', {
      firstName,
      lastName,
      email,
      role,
      permissions
    });

    // Check if admin already exists
    const adminExists = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (adminExists) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    // Validate permissions based on role
    let validatedPermissions = permissions || {};
    
    // Default permissions for each role
    if (role === 'superadmin') {
      // Super Admin gets all permissions
      validatedPermissions = {
        manageUsers: true,
        manageProperties: true,
        manageServices: true,
        viewAnalytics: true,
        manageContent: true,
        systemSettings: true
      };
    } else if (role === 'admin') {
      // Set defaults if not provided
      validatedPermissions = {
        manageUsers: validatedPermissions.manageUsers !== undefined ? validatedPermissions.manageUsers : true,
        manageProperties: validatedPermissions.manageProperties !== undefined ? validatedPermissions.manageProperties : true,
        manageServices: validatedPermissions.manageServices !== undefined ? validatedPermissions.manageServices : true,
        viewAnalytics: validatedPermissions.viewAnalytics !== undefined ? validatedPermissions.viewAnalytics : true,
        manageContent: validatedPermissions.manageContent !== undefined ? validatedPermissions.manageContent : true,
        systemSettings: validatedPermissions.systemSettings !== undefined ? validatedPermissions.systemSettings : false
      };
    } else if (role === 'moderator') {
      // Moderator cannot have manageUsers or systemSettings
      validatedPermissions = {
        manageUsers: false,
        manageProperties: validatedPermissions.manageProperties !== undefined ? validatedPermissions.manageProperties : true,
        manageServices: validatedPermissions.manageServices !== undefined ? validatedPermissions.manageServices : true,
        viewAnalytics: validatedPermissions.viewAnalytics !== undefined ? validatedPermissions.viewAnalytics : true,
        manageContent: validatedPermissions.manageContent !== undefined ? validatedPermissions.manageContent : true,
        systemSettings: false
      };
    }

    // Create admin
    const admin = await Admin.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone || '', // Handle undefined phone
        password,
        role,
        permissions: validatedPermissions,
        userType: 'admin',
        isActive: true
    });

    console.log('Admin created successfully:', {
      id: admin._id,
      email: admin.email,
      role: admin.role
    });

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      data: {
        admin: {
          _id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
          permissions: admin.permissions,
          userType: admin.userType,
          isActive: admin.isActive,
          createdAt: admin.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Admin registration error:', error);
    
    // Handle duplicate key error (email)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get all admins
// @route   GET /api/admin
// @access  Private (Super Admin and Admin with manageUsers permission)
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({ userType: 'admin' })
      .select('-password -__v')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: admins.length,
      data: admins
    });

  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single admin
// @route   GET /api/admin/:id
// @access  Private (Super Admin, Admin with manageUsers, or self)
exports.getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id)
      .select('-password -__v');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: admin
    });

  } catch (error) {
    console.error('Get admin error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update admin
// @route   PUT /api/admin/:id
// @access  Private (Super Admin, Admin with manageUsers, or self with restrictions)
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find admin
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check authorization (already checked in middleware, but double-check)
    const isSuperAdmin = req.user.role === 'superadmin';
    const isSelf = req.user.id === id;
    const hasManageUsers = req.user.role === 'admin' && req.user.permissions?.manageUsers;

    // Non-superadmins cannot update certain fields
    if (!isSuperAdmin) {
      delete updates.role;
      delete updates.permissions;
      delete updates.isActive;
      delete updates.userType;
      delete updates.email; // Email should not be changed easily
    }

    // If admin with manageUsers permission is updating others, they can't change role/permissions
    if (hasManageUsers && !isSuperAdmin && !isSelf) {
      delete updates.role;
      delete updates.permissions;
      delete updates.isActive;
    }

    // Non-superadmins updating themselves can't change role/permissions
    if (isSelf && !isSuperAdmin) {
      delete updates.role;
      delete updates.permissions;
      delete updates.isActive;
      delete updates.email;
    }

    // Super Admin cannot downgrade themselves
    if (isSuperAdmin && id === req.user.id && updates.role && updates.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Super Admin cannot change their own role'
      });
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        admin[key] = updates[key];
      }
    });

    await admin.save();

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: admin
    });

  } catch (error) {
    console.error('Update admin error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete admin (soft delete)
// @route   DELETE /api/admin/:id
// @access  Private (Super Admin only)
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Cannot delete self
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

    res.json({
      success: true,
      message: 'Admin deactivated successfully',
      data: {
        id: admin._id,
        email: admin.email,
        isActive: admin.isActive
      }
    });

  } catch (error) {
    console.error('Delete admin error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get current admin profile
// @route   GET /api/admin/me
// @access  Private
exports.getMyProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id)
      .select('-password -__v');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: admin
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update current admin profile
// @route   PUT /api/admin/me
// @access  Private
exports.updateMyProfile = async (req, res) => {
  try {
    const updates = req.body;
    
    // Remove restricted fields for self-update
    delete updates.role;
    delete updates.permissions;
    delete updates.isActive;
    delete updates.userType;
    delete updates.email; // Email changes should go through a separate process

    const admin = await Admin.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -__v');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: admin
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Change password
// @route   PUT /api/admin/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters'
      });
    }

    // Check password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must contain at least one uppercase letter, one lowercase letter, and one number'
      });
    }

    const admin = await Admin.findById(req.user.id).select('+password');

    // Verify current password
    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as old
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reactivate admin
// @route   PUT /api/admin/:id/reactivate
// @access  Private (Super Admin only)
exports.reactivateAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id);
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Reactivate admin
    admin.isActive = true;
    await admin.save();

    res.json({
      success: true,
      message: 'Admin reactivated successfully',
      data: {
        id: admin._id,
        email: admin.email,
        isActive: admin.isActive
      }
    });

  } catch (error) {
    console.error('Reactivate admin error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Logout admin (client-side token invalidation)
// @route   POST /api/admin/logout
// @access  Private
exports.logoutAdmin = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};