const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);


// Dashboard routes
router.get('/stats', adminDashboardController.getDashboardStats);
router.get('/pending-counts', adminDashboardController.getPendingCounts);
router.get('/recent-activities', adminDashboardController.getRecentActivities);
router.get('/system-health', adminDashboardController.getSystemHealth);


module.exports = router;