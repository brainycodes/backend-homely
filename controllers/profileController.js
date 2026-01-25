const User = require('../models/User');
const cloudinary = require('../config/cloudinary');

class ProfileController {
  // Get user profile
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .select('-password -emailVerificationToken -emailVerificationExpires');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.status(200).json({
        success: true,
        user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching profile'
      });
    }
  }
  
  // Update user profile - only fields from schema
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Handle profile image upload
      if (req.file) {
        // Convert buffer to base64 for Cloudinary
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: 'profiles',
          public_id: `user-${userId}`,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' }
          ]
        });
        
        // Delete old profile image from Cloudinary if exists
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
          const publicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0];
          await cloudinary.uploader.destroy(publicId);
        }
        
        // Save new profile image URL
        user.profileImage = result.secure_url;
      }
      
      // Update only fields that exist in schema
      if (req.body.firstName) {
        user.firstName = req.body.firstName.trim();
      }
      
      if (req.body.lastName) {
        user.lastName = req.body.lastName.trim();
      }
      
      if (req.body.phone !== undefined) {
        user.phone = req.body.phone.trim();
      }
      
      await user.save();
      
      // Get updated user without sensitive data
      const updatedUser = user.toJSON();
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser
      });
      
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }
  
  // Upload profile image only
  async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Convert buffer to base64 for Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'profiles',
        public_id: `user-${req.user.id}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' }
        ]
      });
      
      // Delete old profile image from Cloudinary if exists
      if (user.profileImage && user.profileImage.includes('cloudinary')) {
        const publicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      
      // Update user with new profile image URL
      user.profileImage = result.secure_url;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Profile image uploaded successfully',
        profileImage: user.profileImage
      });
      
    } catch (error) {
      console.error('Upload profile image error:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading profile image',
        error: error.message
      });
    }
  }
  
  // Delete profile image
  async deleteProfileImage(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      if (!user.profileImage) {
        return res.status(400).json({
          success: false,
          message: 'No profile image to delete'
        });
      }
      
      // Delete image from Cloudinary
      if (user.profileImage.includes('cloudinary')) {
        const publicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      
      // Remove profile image from user
      user.profileImage = undefined;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Profile image deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete profile image error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting profile image',
        error: error.message
      });
    }
  }

  // KYC Submission
  async submitKYC(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if KYC is already approved
      if (user.kyc?.status === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'KYC already approved'
        });
      }

      // Check if KYC is pending
      if (user.kyc?.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'KYC already submitted and under review'
        });
      }

      // Initialize KYC object if not exists
      if (!user.kyc) {
        user.kyc = {};
      }

      // Update KYC data
      user.kyc.status = 'pending';
      user.kyc.submittedAt = new Date();
      user.kyc.identityType = req.body.identityType;

      // Upload documents to Cloudinary if provided
      const uploadPromises = [];
      const documentFields = [
        'identityDocument',
        'identityDocumentBack', 
        'proofOfAddress',
        'additionalDocuments'
      ];

      for (const field of documentFields) {
        if (req.files && req.files[field]) {
          const file = req.files[field][0];
          
          // Convert buffer to base64 for Cloudinary
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          // Upload to Cloudinary
          const uploadPromise = cloudinary.uploader.upload(dataURI, {
            folder: `kyc/${userId}`,
            public_id: `${field}-${Date.now()}`,
            resource_type: 'auto'
          }).then(result => {
            user.kyc[field] = result.secure_url;
          });
          
          uploadPromises.push(uploadPromise);
        }
      }

      // Wait for all uploads to complete
      await Promise.all(uploadPromises);

      await user.save();

      // TODO: Send notification to admin for review
      // sendKYCNotification(user);

      res.status(200).json({
        success: true,
        message: 'KYC submitted successfully. It will be reviewed within 24-48 hours.',
        user: user.toJSON()
      });

    } catch (error) {
      console.error('KYC submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Error submitting KYC',
        error: error.message
      });
    }
  }

  // Admin: Get KYC submissions (for admin panel)
  async getKYCSubmissions(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      
      const query = { 'kyc.status': { $ne: 'not_submitted' } };
      if (status) {
        query['kyc.status'] = status;
      }

      const users = await User.find(query)
        .select('firstName lastName email userType phone kyc')
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ 'kyc.submittedAt': -1 });

      const total = await User.countDocuments(query);

      res.status(200).json({
        success: true,
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get KYC submissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching KYC submissions'
      });
    }
  }

  // Admin: Review KYC submission
  async reviewKYC(req, res) {
    try {
      const { userId, status, rejectionReason } = req.body;
      const adminId = req.user.id;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.kyc || user.kyc.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'No pending KYC submission found'
        });
      }

      // Update KYC status
      user.kyc.status = status;
      user.kyc.reviewedAt = new Date();
      user.kyc.reviewedBy = adminId;
      
      if (status === 'rejected' && rejectionReason) {
        user.kyc.rejectionReason = rejectionReason;
      }

      await user.save();

      // TODO: Send notification to user about KYC status update
      // sendKYCStatusUpdate(user);

      res.status(200).json({
        success: true,
        message: `KYC ${status} successfully`,
        user: user.toJSON()
      });

    } catch (error) {
      console.error('Review KYC error:', error);
      res.status(500).json({
        success: false,
        message: 'Error reviewing KYC',
        error: error.message
      });
    }
  }

  // Get KYC status
  async getKYCStatus(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .select('kyc firstName lastName email');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        kyc: user.kyc || { status: 'not_submitted' }
      });

    } catch (error) {
      console.error('Get KYC status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching KYC status'
      });
    }
  }

  // Switch user type
  async switchUserType(req, res) {
    try {
      const userId = req.user.id;
      const { userType } = req.body;

      // Validate user type
      if (!['agent-landlord', 'house-seeker'].includes(userType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user type'
        });
      }

      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is trying to switch to same type
      if (user.userType === userType) {
        return res.status(400).json({
          success: false,
          message: `You are already in ${userType.replace('-', ' ')} mode`
        });
      }

      // If switching to agent-landlord, check KYC status
      if (userType === 'agent-landlord') {
        // Allow switching even without KYC, but user will need KYC for property listing
        // You can add additional checks here if needed
      }

      // Update user type
      user.userType = userType;
      await user.save();

      // Get updated user without sensitive data
      const updatedUser = user.toJSON();

      res.status(200).json({
        success: true,
        message: `Switched to ${userType === 'agent-landlord' ? 'Agent/Landlord' : 'House Seeker'} mode successfully`,
        user: updatedUser
      });

    } catch (error) {
      console.error('Switch user type error:', error);
      res.status(500).json({
        success: false,
        message: 'Error switching user type',
        error: error.message
      });
    }
  }
}

module.exports = new ProfileController();