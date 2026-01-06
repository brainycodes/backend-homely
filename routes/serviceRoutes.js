const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const authMiddleware = require('../middleware/authMiddleware');
const { check } = require('express-validator');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// Validation middleware
const serviceValidation = [
  check('title', 'Title is required').notEmpty().trim(),
  check('title', 'Title must be between 5 and 200 characters').isLength({ min: 5, max: 200 }),
  check('description', 'Description is required').notEmpty().trim(),
  check('description', 'Description must be at least 20 characters').isLength({ min: 20 }),
  check('category', 'Service category is required').notEmpty(),
  check('price', 'Price is required').notEmpty(),
  check('price', 'Price must be a number').isNumeric(),
  check('price', 'Price must be greater than 0').isFloat({ min: 0 }),
  check('location', 'Location is required').notEmpty(),
  check('contactPhone', 'Contact phone is required').notEmpty().trim(),
  check('experienceLevel', 'Experience level is required').notEmpty(),
  check('experienceLevel', 'Invalid experience level').isIn([
    'beginner', 'intermediate', 'professional', 'expert'
  ]),
  check('pricingType', 'Pricing type is required').notEmpty(),
  check('pricingType', 'Invalid pricing type').isIn([
    'hourly', 'project', 'consultation', 'package'
  ])
];

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/featured', serviceController.getFeaturedServices);
router.get('/categories', serviceController.getServiceCategories);
router.get('/:id', serviceController.getServiceById);
router.get('/:id/related', serviceController.getRelatedServices);

// Protected routes (require authentication)
router.use(authMiddleware.protect);

// User service management
router.get('/user/my-services', serviceController.getUserServices);
router.get('/user/stats', serviceController.getServiceStats);
router.get('/user/activity', serviceController.getRecentActivity);
router.get('/user/saved', serviceController.getSavedServices);
router.post('/:id/save', serviceController.toggleSaveService);
router.post('/:id/review', serviceController.addReview);
router.post('/:id/book', serviceController.bookService);

// Create service
router.post(
  '/',
  uploadMiddleware,
  serviceValidation,
  serviceController.createService
);

// Service owner or admin routes
router.put(
  '/:id',
  uploadMiddleware,
  serviceValidation,
  serviceController.updateService
);

router.delete('/:id', serviceController.deleteService);

// Admin only routes
router.use(authMiddleware.restrictTo('admin'));

router.patch('/:id/toggle-featured', serviceController.toggleFeatured);
router.patch('/:id/verify', serviceController.verifyService);

module.exports = router;