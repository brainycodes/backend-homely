// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const { check } = require('express-validator');

// Validation middleware
const reportValidation = [
  check('targetType', 'Target type is required')
    .notEmpty()
    .isIn(['agent', 'property', 'service']),
  
  check('targetId', 'Target ID is required')
    .notEmpty()
    .isMongoId(),
  
  check('reportReason.category', 'Report category is required')
    .notEmpty()
    .isIn([
      'spam', 'fake', 'fraud', 'misleading', 'inappropriate',
      'harassment', 'scam', 'duplicate', 'wrong_category',
      'wrong_price', 'no_response', 'bad_service', 'other'
    ]),
  
  check('reportReason.description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  check('additionalComments')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Comments cannot exceed 1000 characters')
];

// Public routes (no auth required)
router.get('/reasons', reportController.getReportReasons);

// Protected routes (require authentication)
router.use(authMiddleware.protect);

// User report management
router.post('/', reportValidation, reportController.createReport);
router.get('/my-reports', reportController.getMyReports);
router.get('/:id', reportController.getReportById);

module.exports = router;