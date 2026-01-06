// routes/adminServiceRoutes.js
const express = require('express');
const router = express.Router();
const adminServiceController = require('../controllers/adminServiceController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

// All routes are protected
router.use(protect);

// Check for manageServices permission or superadmin role
const checkServicePermission = (req, res, next) => {
  if (req.user.role === 'superadmin' || req.user.permissions?.manageServices) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Not authorized to manage services'
  });
};

// Apply permission check to all routes
router.use(checkServicePermission);

// All services routes (without /services prefix to match your frontend calls)
router.get('/', adminServiceController.getAllServices);
router.get('/stats', adminServiceController.getServiceStats);
router.get('/featured-stats', adminServiceController.getFeaturedStats);

// Pending services routes - MUST COME BEFORE /:id
router.get('/pending', adminServiceController.getPendingServices);
router.get('/pending/:id', adminServiceController.getPendingServiceById);

// Individual service routes - MUST COME AFTER ALL SPECIFIC ROUTES
router.get('/:id', adminServiceController.getServiceById);
router.put('/:id', adminServiceController.updateService);
router.delete('/:id', adminServiceController.deleteService);

// Service actions
router.put('/:id/approve', adminServiceController.approveService);
router.put('/:id/decline', adminServiceController.declineService);
router.put('/:id/request-changes', adminServiceController.requestServiceChanges);
router.put('/:id/verify', adminServiceController.verifyService);
router.put('/:id/unverify', adminServiceController.unverifyService);
router.put('/:id/activate', adminServiceController.activateService);
router.put('/:id/deactivate', adminServiceController.deactivateService);
router.put('/:id/toggle-featured', adminServiceController.toggleFeatured);

module.exports = router;