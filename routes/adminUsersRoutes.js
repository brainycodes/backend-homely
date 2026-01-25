const express = require('express');
const router = express.Router();
const adminUsersController = require('../controllers/adminUsersController');
const { protect, isSuperAdmin, isAdmin } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Get all users (for admin panel)
router.get('/all-users', isAdmin, adminUsersController.getAllUsers);

// Get single user details
router.get('/users/:id', isAdmin, adminUsersController.getUserById);

// Update user status
router.patch('/users/:id/toggle-status', isSuperAdmin, adminUsersController.toggleUserStatus);

// Create new user (admin)
router.post('/users/create', isSuperAdmin, adminUsersController.createUser);

// Update user
router.put('/users/:id', isSuperAdmin, adminUsersController.updateUser);

// Get user statistics
router.get('/users-stats', isAdmin, adminUsersController.getUserStats);

// Get all admins
router.get('/admins', isAdmin, adminUsersController.getAllAdmins);

// Get single admin
router.get('/admins/:id', isAdmin, adminUsersController.getAdminById);

// Update admin
router.put('/admins/:id', isAdmin, adminUsersController.updateAdmin);

// Delete admin (soft delete)
router.delete('/admins/:id', isSuperAdmin, adminUsersController.deleteAdmin);

// Get pending KYC
router.get('/kyc/pending', isAdmin, adminUsersController.getPendingKYC);

// Approve/reject KYC
router.post('/kyc/:userId/review', isAdmin, adminUsersController.reviewKYC);

module.exports = router;