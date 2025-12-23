const User = require('../models/User');
const path = require('path');
const fs = require('fs');

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
        // Delete old profile image if exists
        if (user.profileImage && user.profileImage.startsWith('/uploads/profile')) {
          const oldImagePath = path.join(__dirname, '..', user.profileImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
        
        // Save new profile image path
        user.profileImage = `/uploads/profile/${req.file.filename}`;
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
        // Delete uploaded file if user not found
        const filePath = path.join(__dirname, '../uploads/profile', req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Delete old profile image if exists
      if (user.profileImage && user.profileImage.startsWith('/uploads/profile')) {
        const oldImagePath = path.join(__dirname, '..', user.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      // Update user with new profile image
      user.profileImage = `/uploads/profile/${req.file.filename}`;
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
      
      // Delete image file from server
      if (user.profileImage.startsWith('/uploads/profile')) {
        const imagePath = path.join(__dirname, '..', user.profileImage);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
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