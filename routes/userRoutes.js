const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { check } = require('express-validator');

// Validation middleware
const updateProfileValidation = [
  check('firstName', 'First name is required').optional().notEmpty().trim(),
  check('firstName', 'First name must be at least 2 characters').optional().isLength({ min: 2 }),
  check('lastName', 'Last name is required').optional().notEmpty().trim(),
  check('lastName', 'Last name must be at least 2 characters').optional().isLength({ min: 2 }),
  check('phone', 'Please enter a valid phone number').optional().trim(),
  check('specialization', 'Specialization').optional().trim(),
  check('experience', 'Experience').optional().trim(),
  check('bio', 'Bio must be less than 500 characters').optional().isLength({ max: 500 }),
  check('teamSize', 'Team size must be a number').optional().isInt({ min: 1 })
];

const changePasswordValidation = [
  check('currentPassword', 'Current password is required').notEmpty(),
  check('newPassword', 'New password is required').notEmpty(),
  check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
  check('confirmPassword', 'Confirm password is required').notEmpty(),
  check('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
];

const ratingValidation = [
  check('rating', 'Rating is required').notEmpty(),
  check('rating', 'Rating must be between 1 and 5').isInt({ min: 1, max: 5 }),
  check('review', 'Review must be less than 500 characters').optional().isLength({ max: 500 })
];

// Public routes
router.get('/agents', userController.getAllAgents);
router.get('/agents/:id', userController.getAgentById);
router.get('/agents/:id/reviews', userController.getAgentReviews);

// Protected routes (require authentication)
router.use(authMiddleware.protect);

// User profile routes
router.get('/profile', userController.getUserProfile);
router.get('/profile/:id', userController.getUserProfile);
router.put('/profile', updateProfileValidation, userController.updateProfile);
router.put('/profile/:id', updateProfileValidation, userController.updateProfile);
router.put('/change-password', changePasswordValidation, userController.changePassword);
router.delete('/account', userController.deleteAccount);
router.delete('/account/:id', userController.deleteAccount);

// Rating routes
router.post('/:id/rate', ratingValidation, userController.rateAgent);
router.get('/:id/rating', userController.getUserRating);
router.delete('/:id/rating', userController.deleteRating);
router.get('/:id/reviews', userController.getAgentReviews);

// Save user route
router.post('/save-user', userController.saveUser);

// Admin only routes
router.use(authMiddleware.restrictTo('admin'));

router.get('/', userController.getAllUsers);
router.patch('/:id/toggle-active', userController.toggleActiveStatus);

module.exports = router;