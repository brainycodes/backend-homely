const Property = require('../models/Property');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

class PropertyController {
  // Create new property
  async createProperty(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            const filePath = path.join(__dirname, '../uploads/properties', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId);
      
      // Check if user is agent-landlord
      if (user.userType !== 'agent-landlord') {
        // Clean up uploaded files if not authorized
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            const filePath = path.join(__dirname, '../uploads/properties', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
        return res.status(403).json({
          success: false,
          message: 'Only agents and landlords can create properties'
        });
      }
      
      // Handle image upload - Save file paths
      let images = [];
      if (req.files && req.files.length > 0) {
        images = req.files.map((file, index) => ({
          url: `/uploads/properties/${file.filename}`, // This will be served statically
          public_id: `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          isPrimary: index === 0,
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        }));
      } else if (req.body.images && req.body.images.trim() !== '') {
        // Fallback for base64 images if provided
        const imageArray = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
        images = imageArray.map((img, index) => ({
          url: img,
          public_id: `property_${Date.now()}_${index}`,
          isPrimary: index === 0,
          filename: `base64_image_${index}.jpg`
        }));
      }
      
      // Create property data
      const propertyData = {
        ...req.body,
        postedBy: userId,
        images,
        agent: {
          name: `${user.firstName} ${user.lastName}`,
          role: user.userType === 'agent-landlord' ? 'Real Estate Agent' : 'Landlord',
          phone: user.phone || '',
          email: user.email,
          avatar: user.profileImage || ''
        },
        contactInfo: {
          phone: req.body.contactPhone || user.phone,
          email: req.body.contactEmail || user.email,
          whatsapp: req.body.contactWhatsapp
        }
      };
      
      // Convert string arrays to arrays
      if (req.body.amenities) {
        propertyData.amenities = Array.isArray(req.body.amenities) 
          ? req.body.amenities 
          : req.body.amenities.split(',').map(item => item.trim());
      }
      
      if (req.body.neighborhoodLandmarks) {
        propertyData.neighborhood = {
          ...propertyData.neighborhood,
          landmarks: Array.isArray(req.body.neighborhoodLandmarks)
            ? req.body.neighborhoodLandmarks
            : req.body.neighborhoodLandmarks.split(',').map(item => item.trim())
        };
      }
      
      // Parse numbers
      propertyData.price = parseFloat(req.body.price);
      propertyData.bedrooms = parseInt(req.body.bedrooms);
      propertyData.bathrooms = parseInt(req.body.bathrooms);
      propertyData.area = parseFloat(req.body.area);
      
      // Format dates using moment
      if (req.body.availableDate) {
        propertyData.availableDate = moment(req.body.availableDate).toISOString();
      }
      
      const property = new Property(propertyData);
      await property.save();
      
      // Populate the postedBy field
      const populatedProperty = await Property.findById(property._id)
        .populate('postedBy', 'firstName lastName email phone');
      
      res.status(201).json({
        success: true,
        message: 'Property created successfully',
        property: populatedProperty
      });
      
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          const filePath = path.join(__dirname, '../uploads/properties', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      console.error('Create property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating property',
        error: error.message
      });
    }
  }
  
  // Get all properties (with filters) - Featured First
  async getAllProperties(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const filters = req.query;
      
      const skip = (page - 1) * limit;
      const query = { isActive: true, isVerified: true };
      
      // Apply filters
      if (filters.location) query.location = filters.location;
      if (filters.type) query.type = filters.type;
      if (filters.status) query.status = filters.status;
      if (filters.minPrice) query.price = { ...query.price, $gte: filters.minPrice };
      if (filters.maxPrice) query.price = { ...query.price, $lte: filters.maxPrice };
      if (filters.minBedrooms) query.bedrooms = { $gte: filters.minBedrooms };
      if (filters.minBathrooms) query.bathrooms = { $gte: filters.minBathrooms };
      if (filters.amenities) query.amenities = { $all: filters.amenities.split(',') };
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { address: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Get total count
      const total = await Property.countDocuments(query);
      
      // Get properties with featured sorting first
      const properties = await Property.find(query)
        .populate('postedBy', 'firstName lastName email phone userType')
        .sort({ featured: -1, createdAt: -1 }) // Featured first, then newest
        .skip(skip)
        .limit(limit);
      
      // Construct full image URLs with protocol and host
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const formattedProperties = properties.map(property => {
        const propertyObj = property.toObject();
        
        // Handle image URLs
        if (propertyObj.images && Array.isArray(propertyObj.images)) {
          propertyObj.images = propertyObj.images.map(img => {
            if (img.url && (img.url.startsWith('http') || img.url.startsWith('data:'))) {
              return img;
            }
            if (img.url && img.url.startsWith('/')) {
              return {
                ...img,
                url: `${baseUrl}${img.url}`
              };
            }
            // For uploaded files
            if (img.filename) {
              return {
                ...img,
                url: `${baseUrl}/uploads/properties/${img.filename}`
              };
            }
            return img;
          });
        }
        
        return {
          ...propertyObj,
          createdAtFormatted: moment(property.createdAt).fromNow(),
          availableDateFormatted: property.availableDate ? 
            moment(property.availableDate).format('MMMM Do, YYYY') : null
        };
      });
      
      res.status(200).json({
        success: true,
        properties: formattedProperties,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching properties',
        error: error.message
      });
    }
  }

  // Get single property by ID
  async getPropertyById(req, res) {
    try {
      const property = await Property.findById(req.params.id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .lean();
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Construct full image URLs with protocol and host
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      if (property.images && Array.isArray(property.images)) {
        property.images = property.images.map(img => {
          // If image URL is already a full URL or data URL, use it as is
          if (img.url.startsWith('http') || img.url.startsWith('data:')) {
            return img;
          }
          
          // If it's a relative path, prepend with base URL
          if (img.url.startsWith('/')) {
            return {
              ...img,
              url: `${baseUrl}${img.url}`
            };
          }
          
          // If it's just a filename, construct the full path
          return {
            ...img,
            url: `${baseUrl}/uploads/properties/${img.filename || img.url}`
          };
        });
      }
      
      // Format dates using moment
      property.createdAtFormatted = moment(property.createdAt).fromNow();
      property.updatedAtFormatted = moment(property.updatedAt).fromNow();
      if (property.availableDate) {
        property.availableDateFormatted = moment(property.availableDate).format('MMMM Do, YYYY');
      }
      
      // Increment views
      await Property.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
      
      res.status(200).json({
        success: true,
        property
      });
      
    } catch (error) {
      console.error('Get property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching property',
        error: error.message
      });
    }
  }
  
  // Update property
  async updateProperty(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            const filePath = path.join(__dirname, '../uploads/properties', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        // Clean up uploaded files
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            const filePath = path.join(__dirname, '../uploads/properties', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Check if user owns the property or is admin
      if (property.postedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        // Clean up uploaded files
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            const filePath = path.join(__dirname, '../uploads/properties', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this property'
        });
      }
      
      // Handle image updates
      let images = property.images || [];
      
      // Delete specified images
      if (req.body.imagesToDelete) {
        const imagesToDelete = Array.isArray(req.body.imagesToDelete) 
          ? req.body.imagesToDelete 
          : req.body.imagesToDelete.split(',');
        
        // Remove from array and delete files from server
        const imagesToRemove = images.filter(img => imagesToDelete.includes(img.public_id));
        
        images = images.filter(img => !imagesToDelete.includes(img.public_id));
        
        // Delete files from server
        imagesToRemove.forEach(img => {
          if (img.filename && img.filename.startsWith('property-')) {
            const filePath = path.join(__dirname, '../uploads/properties', img.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        });
      }
      
      // Add new images
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map((file, index) => ({
          url: `/uploads/properties/${file.filename}`,
          public_id: `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          isPrimary: images.length === 0 && index === 0,
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        }));
        
        images = [...images, ...newImages];
      }
      
      // Update property data
      const updateData = {
        ...req.body,
        images
      };
      
      // Convert string arrays to arrays
      if (req.body.amenities) {
        updateData.amenities = Array.isArray(req.body.amenities) 
          ? req.body.amenities 
          : req.body.amenities.split(',').map(item => item.trim());
      }
      
      // Parse numbers
      if (req.body.price) updateData.price = parseFloat(req.body.price);
      if (req.body.bedrooms) updateData.bedrooms = parseInt(req.body.bedrooms);
      if (req.body.bathrooms) updateData.bathrooms = parseInt(req.body.bathrooms);
      if (req.body.area) updateData.area = parseFloat(req.body.area);
      
      // Format dates using moment
      if (req.body.availableDate) {
        updateData.availableDate = moment(req.body.availableDate).toISOString();
      }
      
      const updatedProperty = await Property.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('postedBy', 'firstName lastName email phone');
      
      res.status(200).json({
        success: true,
        message: 'Property updated successfully',
        property: updatedProperty
      });
      
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          const filePath = path.join(__dirname, '../uploads/properties', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      console.error('Update property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating property',
        error: error.message
      });
    }
  }
  
  // Delete property
  async deleteProperty(req, res) {
    try {
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Check if user owns the property or is admin
      if (property.postedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this property'
        });
      }
      
      await Property.findByIdAndDelete(req.params.id);
      
      res.status(200).json({
        success: true,
        message: 'Property deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting property',
        error: error.message
      });
    }
  }
  
  // Get user's properties
  async getUserProperties(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const properties = await Property.find({ postedBy: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format dates using moment
      const formattedProperties = properties.map(property => ({
        ...property,
        createdAtFormatted: moment(property.createdAt).fromNow(),
        updatedAtFormatted: moment(property.updatedAt).fromNow(),
        availableDateFormatted: property.availableDate ? 
          moment(property.availableDate).format('MMMM Do, YYYY') : null
      }));
      
      const total = await Property.countDocuments({ postedBy: req.user.id });
      
      res.status(200).json({
        success: true,
        properties: formattedProperties,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get user properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user properties',
        error: error.message
      });
    }
  }
  
  // Toggle property featured status (admin only)
  async toggleFeatured(req, res) {
    try {
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      property.featured = !property.featured;
      await property.save();
      
      res.status(200).json({
        success: true,
        message: `Property ${property.featured ? 'featured' : 'unfeatured'} successfully`,
        property
      });
      
    } catch (error) {
      console.error('Toggle featured error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling featured status',
        error: error.message
      });
    }
  }
  
  // Verify property (admin only)
  async verifyProperty(req, res) {
    try {
      const { verificationNotes } = req.body;
      
      const property = await Property.findByIdAndUpdate(
        req.params.id,
        {
          isVerified: true,
          verificationNotes,
          verifiedAt: new Date()
        },
        { new: true }
      );
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Property verified successfully',
        property
      });
      
    } catch (error) {
      console.error('Verify property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error verifying property',
        error: error.message
      });
    }
  }
  
  // Get related properties
  async getRelatedProperties(req, res) {
    try {
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      const relatedProperties = await Property.find({
        _id: { $ne: property._id },
        location: property.location,
        type: property.type,
        isActive: true,
        isVerified: true
      })
      .limit(4)
      .sort({ featured: -1, createdAt: -1 })
      .lean();
      
      // Format dates using moment
      const formattedProperties = relatedProperties.map(prop => ({
        ...prop,
        createdAtFormatted: moment(prop.createdAt).fromNow()
      }));
      
      res.status(200).json({
        success: true,
        properties: formattedProperties
      });
      
    } catch (error) {
      console.error('Get related properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching related properties',
        error: error.message
      });
    }
  }
  
  // Toggle save property
  async toggleSaveProperty(req, res) {
    try {
      const property = await Property.findById(req.params.id);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      const user = await User.findById(req.user.id);
      
      if (!user.savedProperties) {
        user.savedProperties = [];
      }
      
      const isSaved = user.savedProperties.includes(property._id);
      
      if (isSaved) {
        // Remove from saved
        user.savedProperties = user.savedProperties.filter(
          id => id.toString() !== property._id.toString()
        );
        property.saves = Math.max(0, property.saves - 1);
      } else {
        // Add to saved
        user.savedProperties.push(property._id);
        property.saves += 1;
      }
      
      await user.save();
      await property.save();
      
      res.status(200).json({
        success: true,
        message: `Property ${isSaved ? 'removed from' : 'added to'} saved properties`,
        isSaved: !isSaved,
        saves: property.saves
      });
      
    } catch (error) {
      console.error('Toggle save error:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving property',
        error: error.message
      });
    }
  }
  
  // Get saved properties
  async getSavedProperties(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .populate({
          path: 'savedProperties',
          options: { sort: { createdAt: -1 } }
        })
        .lean();
      
      // Format dates using moment
      const formattedProperties = (user.savedProperties || []).map(property => ({
        ...property,
        createdAtFormatted: moment(property.createdAt).fromNow()
      }));
      
      res.status(200).json({
        success: true,
        properties: formattedProperties
      });
      
    } catch (error) {
      console.error('Get saved properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching saved properties',
        error: error.message
      });
    }
  }
  
  // Get featured properties
  async getFeaturedProperties(req, res) {
    try {
      const properties = await Property.find({
        featured: true,
        isActive: true,
        isVerified: true
      })
      .limit(6)
      .sort({ createdAt: -1 })
      .populate('postedBy', 'firstName lastName')
      .lean();
      
      // Format dates using moment
      const formattedProperties = properties.map(property => ({
        ...property,
        createdAtFormatted: moment(property.createdAt).fromNow()
      }));
      
      res.status(200).json({
        success: true,
        properties: formattedProperties
      });
      
    } catch (error) {
      console.error('Get featured properties error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching featured properties',
        error: error.message
      });
    }
  }
  
  // Get property stats
  async getPropertyStats(req, res) {
    try {
      const userId = req.user.id;
      
      const stats = await Property.aggregate([
        { $match: { postedBy: userId } },
        {
          $group: {
            _id: null,
            totalProperties: { $sum: 1 },
            totalViews: { $sum: "$views" },
            totalSaves: { $sum: "$saves" },
            avgPrice: { $avg: "$price" },
            forSaleCount: { 
              $sum: { 
                $cond: [{ $eq: ["$status", "for-sale"] }, 1, 0] 
              } 
            },
            forRentCount: { 
              $sum: { 
                $cond: [{ $eq: ["$status", "for-rent"] }, 1, 0] 
              } 
            },
            soldCount: { 
              $sum: { 
                $cond: [{ $eq: ["$status", "sold"] }, 1, 0] 
              } 
            },
            rentedCount: { 
              $sum: { 
                $cond: [{ $eq: ["$status", "rented"] }, 1, 0] 
              } 
            },
            featuredCount: { 
              $sum: { 
                $cond: ["$featured", 1, 0] 
              } 
            }
          }
        }
      ]);
      
      res.status(200).json({
        success: true,
        stats: stats[0] || {
          totalProperties: 0,
          totalViews: 0,
          totalSaves: 0,
          avgPrice: 0,
          forSaleCount: 0,
          forRentCount: 0,
          soldCount: 0,
          rentedCount: 0,
          featuredCount: 0
        }
      });
      
    } catch (error) {
      console.error('Get property stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching property stats',
        error: error.message
      });
    }
  }
  
  // Get recent activity
  async getRecentActivity(req, res) {
    try {
      const userId = req.user.id;
      
      const activities = await Property.aggregate([
        { $match: { postedBy: userId } },
        { $sort: { updatedAt: -1 } },
        { $limit: 10 },
        {
          $project: {
            title: 1,
            type: 1,
            status: 1,
            views: 1,
            saves: 1,
            updatedAt: 1,
            activityType: {
              $cond: {
                if: { $eq: ["$createdAt", "$updatedAt"] },
                then: "created",
                else: "updated"
              }
            },
            timeAgo: {
              $subtract: [new Date(), "$updatedAt"]
            }
          }
        }
      ]);
      
      // Format activities with moment
      const formattedActivities = activities.map(activity => ({
        ...activity,
        timeAgoFormatted: moment(activity.updatedAt).fromNow(),
        dateFormatted: moment(activity.updatedAt).format('MMMM Do, YYYY')
      }));
      
      res.status(200).json({
        success: true,
        activities: formattedActivities
      });
      
    } catch (error) {
      console.error('Get recent activity error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recent activity',
        error: error.message
      });
    }
  }
}

module.exports = new PropertyController();