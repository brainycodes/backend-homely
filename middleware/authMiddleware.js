const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

const protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user ID from token - handle both id and userId
    const userId = decoded.id || decoded.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    // Try to find user in Admin collection first (for admin users)
    let user = await Admin.findById(userId).select('-password');
    
    // If not found in Admin, try User collection
    if (!user) {
      user = await User.findById(userId).select('-password');
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    
    next();
  };
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Check role-based authorization
    if (roles.includes(req.user.role)) {
      return next();
    }

    // Check permission-based authorization (for admin users)
    if (req.user.role === 'admin' && req.user.permissions) {
      // Admin with manageUsers permission can access admin management
      if (req.user.permissions.manageUsers) {
        return next();
      }
    }

    res.status(403).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  };
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
  
  // Check if user is an admin (has userType 'admin' or role is admin/superadmin/moderator)
  const isAdminUser = req.user.userType === 'admin' || 
                     ['superadmin', 'admin', 'moderator'].includes(req.user.role);
  
  if (!isAdminUser) {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can access this route'
    });
  }
  
  next();
};

const isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
  
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin can perform this action'
    });
  }
  
  next();
};

const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    // Super admin has all permissions
    if (req.user.role === 'superadmin') {
      return next();
    }
    
    // Check if user has the specific permission
    if (req.user.permissions && req.user.permissions[permission]) {
      return next();
    }
    
    res.status(403).json({
      success: false,
      message: `You don't have permission to ${permission}`
    });
  };
};

// Backward compatibility alias
const adminProtect = protect;
const adminAuthorize = authorize;

module.exports = {
  protect,
  restrictTo,
  authorize,
  isAdmin,
  isSuperAdmin,
  hasPermission,
  // Aliases for backward compatibility
  adminProtect,
  adminAuthorize
};