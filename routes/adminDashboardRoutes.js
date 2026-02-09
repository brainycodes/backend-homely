const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Get all dashboard statistics
router.get('/stats', adminDashboardController.getDashboardStats);

// Get pending counts for sidebar
router.get('/pending-counts', adminDashboardController.getPendingCounts);

// Get recent activities
router.get('/recent-activities', adminDashboardController.getRecentActivities);

// Get system health
router.get('/system-health', adminDashboardController.getSystemStats);

module.exports = router;