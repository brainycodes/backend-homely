const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/properties');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'property-' + uniqueSuffix + ext);
  }
});

// Enhanced file filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed! (jpeg, jpg, png, gif, webp)'), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (kept your original size)
    files: 10 // Max 10 files
  }
});

// Enhanced middleware function
const uploadMiddleware = (req, res, next) => {
  // Only process files for POST or PUT requests
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Processing file upload for:', req.method, req.url);
    
    // Use multer to handle the upload
    upload.array('images', 10)(req, res, function(err) {
      if (err) {
        // Handle multer-specific errors
        if (err instanceof multer.MulterError) {
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
          return res.status(400).json({
            success: false,
            message: `File upload error: ${err.message}`
          });
        }
        // Handle custom file filter errors
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      // Files are available in req.files
      if (req.files && req.files.length > 0) {
        console.log(`Uploaded ${req.files.length} file(s) successfully`);
      }
      next();
    });
  } else {
    // For GET, DELETE, etc., skip file processing
    console.log('Skipping file upload for:', req.method, req.url);
    next();
  }
};

module.exports = uploadMiddleware;