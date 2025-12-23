// src/routes/propertyRoutes.js
const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
const authMiddleware = require('../middleware/authMiddleware');
const { check } = require('express-validator');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// Validation middleware
const propertyValidation = [
  check('title', 'Title is required').notEmpty().trim(),
  check('title', 'Title must be between 5 and 200 characters').isLength({ min: 5, max: 200 }),
  check('description', 'Description is required').notEmpty().trim(),
  check('description', 'Description must be at least 20 characters').isLength({ min: 20 }),
  check('type', 'Property type is required').notEmpty(),
  check('type', 'Invalid property type').isIn([
    'apartment', 'duplex', 'villa', 'bungalow', 'townhouse',
    'penthouse', 'studio', 'land', 'commercial', 'mansion'
  ]),
  check('status', 'Property status is required').notEmpty(),
  check('status', 'Invalid status').isIn(['for-sale', 'for-rent', 'sold', 'rented', 'pending']),
  check('price', 'Price is required').notEmpty(),
  check('price', 'Price must be a number').isNumeric(),
  check('price', 'Price must be greater than 0').isFloat({ min: 0 }),
  check('location', 'Location is required').notEmpty(),
  check('address', 'Address is required').notEmpty().trim(),
  check('bedrooms', 'Number of bedrooms is required').notEmpty(),
  check('bedrooms', 'Bedrooms must be a number').isInt({ min: 0 }),
  check('bathrooms', 'Number of bathrooms is required').notEmpty(),
  check('bathrooms', 'Bathrooms must be a number').isInt({ min: 0 }),
  check('area', 'Area is required').notEmpty(),
  check('area', 'Area must be a number').isFloat({ min: 0 }),
  check('contactPhone', 'Contact phone is required').notEmpty().trim()
];

// ========== PUBLIC ROUTES (No auth required) ==========
router.get('/', propertyController.getAllProperties);
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/:id', propertyController.getPropertyById);
router.get('/:id/related', propertyController.getRelatedProperties);

// ========== PROTECTED ROUTES (Require auth) ==========
router.use(authMiddleware.protect);

// User property management
router.get('/user/my-properties', propertyController.getUserProperties);
router.get('/user/stats', propertyController.getPropertyStats);
router.get('/user/activity', propertyController.getRecentActivity);
router.get('/user/saved', propertyController.getSavedProperties);
router.post('/:id/save', propertyController.toggleSaveProperty);

// Create property (with upload middleware)
router.post(
  '/',
  uploadMiddleware,  // Only for POST requests with files
  propertyValidation,
  propertyController.createProperty
);

// Update property (with upload middleware)
router.put(
  '/:id',
  uploadMiddleware,  // Only for PUT requests with files
  propertyValidation,
  propertyController.updateProperty
);

// Delete property
router.delete('/:id', propertyController.deleteProperty);

// ========== ADMIN ROUTES ==========
router.use(authMiddleware.restrictTo('admin'));

router.patch('/:id/toggle-featured', propertyController.toggleFeatured);
router.patch('/:id/verify', propertyController.verifyProperty);

module.exports = router;