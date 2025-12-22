const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { protect, isAdmin, isSuperAdmin } = require('../middleware/authMiddleware');

// ========== PUBLIC ROUTES ==========

// Validation for login
const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Admin login - PUBLIC
router.post('/login', validateLogin, adminController.loginAdmin);

// ========== PROTECTED ROUTES ==========

// All routes below require authentication
router.use(protect);

// Check if user is admin for admin-specific routes
const checkAdmin = (req, res, next) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can access this route'
    });
  }
  next();
};

// Apply admin check to all protected routes
router.use(checkAdmin);

// ========== PROFILE ROUTES ==========

// Get current admin profile
router.get('/me', adminController.getMyProfile);

router.get('/notifications', async (req, res) => {
  try {
    res.json({
      success: true,
      data: [] // Return empty array or fetch from database
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
});

// Update current admin profile
router.put('/me', adminController.updateMyProfile);

// Change password
router.put('/change-password', adminController.changePassword);

// Logout
router.post('/logout', adminController.logoutAdmin);


// ========== ADMIN MANAGEMENT ROUTES ==========

// Validation for admin registration
const validateAdminRegistration = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .trim()
    .escape()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters'),
  
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .trim()
    .escape()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters'),
  
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('role')
    .isIn(['superadmin', 'admin', 'moderator'])
    .withMessage('Invalid role'),
  
  body('permissions')
    .optional()
    .isObject()
    .withMessage('Permissions must be an object')
];

// Register new admin (Super Admin only)
router.post('/register', 
  isSuperAdmin,  // Only Super Admin can register new admins
  validateAdminRegistration, 
  adminController.registerAdmin
);

// View all admins - accessible to Super Admin or Admin with manageUsers permission
router.get('/', 
  (req, res, next) => {
    if (req.user.role === 'superadmin' || 
        (req.user.role === 'admin' && req.user.permissions?.manageUsers)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view admins'
    });
  },
  adminController.getAllAdmins
);

// Get single admin - accessible to Super Admin, Admin with manageUsers, or self
router.get('/:id', 
  (req, res, next) => {
    const isSelf = req.params.id === req.user.id;
    const canView = req.user.role === 'superadmin' || 
                   (req.user.role === 'admin' && req.user.permissions?.manageUsers) ||
                   isSelf;
    
    if (canView) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this admin'
    });
  },
  adminController.getAdminById
);

// Update admin - different permissions based on who's being updated
router.put('/:id', 
  (req, res, next) => {
    const isSelf = req.params.id === req.user.id;
    const isSuperAdmin = req.user.role === 'superadmin';
    const hasManageUsers = req.user.role === 'admin' && req.user.permissions?.manageUsers;
    
    // Self-update allowed for all admins
    if (isSelf) {
      return next();
    }
    
    // Super Admin can update anyone
    if (isSuperAdmin) {
      return next();
    }
    
    // Admin with manageUsers can update others (but not Super Admins)
    if (hasManageUsers) {
      // Check if they're trying to update a Super Admin
      // This check will be done in the controller
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this admin'
    });
  },
  adminController.updateAdmin
);

// Delete admin - Only Super Admin
router.delete('/:id', isSuperAdmin, adminController.deleteAdmin);

// Reactivate admin - Only Super Admin
router.put('/:id/reactivate', isSuperAdmin, adminController.reactivateAdmin);

module.exports = router;