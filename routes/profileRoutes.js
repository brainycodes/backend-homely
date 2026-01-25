const express = require('express');
const router = express.Router();
const multer = require('multer');
const profileController = require('../controllers/profileController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
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

// KYC specific upload (accepts images and PDFs)
const kycUpload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Apply auth middleware to all routes
router.use(protect);

// Profile routes
router.get('/', profileController.getProfile);
router.put('/update', upload.single('profileImage'), profileController.updateProfile);
router.post('/upload-image', upload.single('profileImage'), profileController.uploadProfileImage);
router.delete('/image', profileController.deleteProfileImage);

// KYC routes
router.post(
  '/kyc/submit',
  kycUpload.fields([
    { name: 'identityDocument', maxCount: 1 },
    { name: 'identityDocumentBack', maxCount: 1 },
    { name: 'proofOfAddress', maxCount: 1 },
    { name: 'additionalDocuments', maxCount: 5 }
  ]),
  profileController.submitKYC
);

router.get('/kyc/status', profileController.getKYCStatus);

// Admin KYC routes
router.get('/kyc/submissions', isAdmin, profileController.getKYCSubmissions);
router.post('/kyc/review', isAdmin, profileController.reviewKYC);


router.post('/switch-user-type', profileController.switchUserType);

module.exports = router;