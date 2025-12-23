// routes/adminPropertyRoutes.js
const express = require('express');
const router = express.Router();
const adminPropertyController = require('../controllers/adminPropertyController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

// All routes are protected
router.use(protect);

// Check for manageProperties permission or superadmin role
const checkPropertyPermission = (req, res, next) => {
  if (req.user.role === 'superadmin' || req.user.permissions?.manageProperties) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Not authorized to manage properties'
  });
};

// Apply permission check to all routes
router.use(checkPropertyPermission);

// All properties routes
router.get('/', adminPropertyController.getAllProperties);
router.get('/stats', adminPropertyController.getPropertyStats);
router.get('/featured-stats', adminPropertyController.getFeaturedStats);

// Pending properties routes
router.get('/pending', adminPropertyController.getPendingProperties);
router.get('/pending/:id', adminPropertyController.getPendingPropertyById);

// Property actions
router.put('/:id/approve', adminPropertyController.approveProperty);
router.put('/:id/decline', adminPropertyController.declineProperty);
router.put('/:id/request-changes', adminPropertyController.requestPropertyChanges);
router.put('/:id/verify', adminPropertyController.verifyProperty);
router.put('/:id/unverify', adminPropertyController.unverifyProperty);
router.put('/:id/activate', adminPropertyController.activateProperty);
router.put('/:id/deactivate', adminPropertyController.deactivateProperty);
router.put('/:id/toggle-featured', adminPropertyController.toggleFeatured);

module.exports = router;