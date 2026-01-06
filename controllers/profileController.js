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
}

module.exports = new ProfileController();