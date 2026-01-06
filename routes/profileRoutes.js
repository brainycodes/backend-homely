const express = require('express');
const router = express.Router();
const multer = require('multer');
const profileController = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Apply auth middleware to all routes
router.use(protect);

// @route   GET /api/profile
// @desc    Get user profile
// @access  Private
router.get('/', profileController.getProfile);

// @route   PUT /api/profile/update
// @desc    Update user profile
// @access  Private
router.put('/update', upload.single('profileImage'), profileController.updateProfile);

// @route   POST /api/profile/upload-image
// @desc    Upload profile image
// @access  Private
router.post('/upload-image', upload.single('profileImage'), profileController.uploadProfileImage);

// @route   DELETE /api/profile/image
// @desc    Delete profile image
// @access  Private
router.delete('/image', profileController.deleteProfileImage);

module.exports = router;