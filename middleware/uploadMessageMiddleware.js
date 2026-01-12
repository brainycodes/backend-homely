const multer = require('multer');
const path = require('path');

// Memory storage for Cloudinary
const storage = multer.memoryStorage();

// File filter for messages (accepts various file types)
const fileFilter = (req, file, cb) => {
  // Define allowed mime types
  const allowedMimeTypes = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ];

  // Check file extension
  const allowedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.mp4', '.webm', '.ogg', '.mov',
    '.mp3', '.wav', '.ogg', '.m4a',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'
  ];

  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;

  if (allowedMimeTypes.includes(mimetype) && allowedExtensions.includes(extname)) {
    return cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${mimetype}. Allowed: images, videos, audio, documents`));
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 10 // Max 10 files at once (for future multiple file support)
  },
  fileFilter: fileFilter
});

// Single file upload middleware
const uploadSingle = (req, res, next) => {
  const uploadHandler = upload.single('attachment');
  
  uploadHandler(req, res, function(err) {
    if (err) {
      console.error('Upload error:', err.message);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 50MB.'
        });
      }
      if (err.message.includes('Unsupported file type')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Too many files uploaded. Maximum 10 files allowed.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: err.message
      });
    }
    
    // Validate file type based on message type if provided
    if (req.file && req.body.messageType) {
      const fileMime = req.file.mimetype;
      const messageType = req.body.messageType;
      
      const typeMap = {
        'image': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        'video': ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
        'audio': ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'],
        'document': [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain'
        ]
      };
      
      if (typeMap[messageType] && !typeMap[messageType].includes(fileMime)) {
        return res.status(400).json({
          success: false,
          message: `File type mismatch. Expected ${messageType}, got ${fileMime.split('/')[0]}`
        });
      }
    }
    
    // Add file info to request for easier access
    if (req.file) {
      req.fileInfo = {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer
      };
    }
    
    next();
  });
};

// Multiple files upload middleware
const uploadMultiple = (req, res, next) => {
  const uploadHandler = upload.array('attachments', 10);
  
  uploadHandler(req, res, function(err) {
    if (err) {
      console.error('Multiple upload error:', err.message);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 50MB per file.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 10 files allowed.'
        });
      }
      if (err.message.includes('Unsupported file type')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload failed',
        error: err.message
      });
    }
    
    // Add files info to request
    if (req.files && req.files.length > 0) {
      req.filesInfo = req.files.map(file => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer
      }));
    }
    
    next();
  });
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  upload // Export the raw multer instance for flexibility
};