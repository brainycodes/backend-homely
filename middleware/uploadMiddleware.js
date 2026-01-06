const multer = require('multer');

// Use memory storage for Cloudinary (no disk storage needed)
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  // Accept only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files
  },
  fileFilter: fileFilter
});

// Middleware function
const uploadMiddleware = (req, res, next) => {
  // Use upload.array to handle multiple files
  const uploadHandler = upload.array('images', 10);
  
  uploadHandler(req, res, function(err) {
    if (err) {
      // Handle multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 10MB per image.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 10 images allowed.'
        });
      }
      if (err.message === 'Not an image! Please upload only images.') {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only images are allowed.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: err.message
      });
    }
    
    // Files are available in req.files (as buffers in memory)
    next();
  });
};

module.exports = uploadMiddleware;