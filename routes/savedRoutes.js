const express = require('express');
const router = express.Router();
const savedController = require('../controllers/savedController');
const authMiddleware = require('../middleware/authMiddleware');
const { check } = require('express-validator');

// Validation middleware
const saveItemValidation = [
  check('itemType', 'Item type is required').notEmpty().isIn(['property', 'service']),
  check('itemId', 'Item ID is required').notEmpty().isMongoId(),
  check('notes', 'Notes must be less than 500 characters').optional().isLength({ max: 500 }),
  check('tags', 'Tags must be an array or comma-separated string').optional()
];

const updateSavedValidation = [
  check('notes', 'Notes must be less than 500 characters').optional().isLength({ max: 500 }),
  check('tags', 'Tags must be an array or comma-separated string').optional()
];

// All routes require authentication
router.use(authMiddleware.protect);

// Save an item
router.post('/', saveItemValidation, savedController.saveItem);

// Get all saved items
router.get('/', savedController.getSavedItems);

// Get saved item count
router.get('/count', savedController.getSavedItemCount);

// Search saved items
router.get('/search', savedController.searchSavedItems);

// Check if item is saved
router.get('/check/:itemType/:itemId', savedController.checkIfSaved);

// Get saved items by type
router.get('/type/:itemType', savedController.getSavedItemsByType);

// Update saved item
router.put('/:id', updateSavedValidation, savedController.updateSavedItem);

// Remove saved item
router.delete('/:id', savedController.removeSavedItem);

// Clear all saved items
router.delete('/', savedController.clearAllSavedItems);

module.exports = router;