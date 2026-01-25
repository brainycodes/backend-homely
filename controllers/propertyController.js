const Property = require('../models/Property');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const moment = require('moment');
const cloudinary = require('../config/cloudinary');

class PropertyController {
  // Create new property
  async createProperty(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId);
      
      // Check if user is agent-landlord
      if (user.userType !== 'agent-landlord') {
        return res.status(403).json({
          success: false,
          message: 'Only agents and landlords can create properties'
        });
      }
      
      // Handle image upload to Cloudinary
      let images = [];
      if (req.files && req.files.length > 0) {
        // Upload each image to Cloudinary
        const uploadPromises = req.files.map(async (file, index) => {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'properties',
            public_id: `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            transformation: [
              { width: 1200, height: 800, crop: 'fill', quality: 'auto:good' }
            ]
          });
          
          return {
            url: result.secure_url,
            public_id: result.public_id,
            isPrimary: index === 0,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          };
        });
        
        images = await Promise.all(uploadPromises);
      } else if (req.body.images && req.body.images.trim() !== '') {
        // Fallback for base64 images if provided
        const imageArray = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
        images = imageArray.map((img, index) => ({
          url: img,
          public_id: `property_${Date.now()}_${index}`,
          isPrimary: index === 0
        }));
      }
      
      // Create property data - FIXED: Ensure postedBy has all needed fields
      const propertyData = {
        ...req.body,
        postedBy: userId,
        images,
        agent: {
          id: userId,
          name: `${user.firstName} ${user.lastName}`,
          profileImage: user.profileImage || '',
          role: user.userType === 'agent-landlord' ? 'Real Estate Agent' : 'Landlord',
          phone: user.phone || '',
          email: user.email,
          avatar: user.profileImage || '' // Keep avatar for backward compatibility
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
      
      // Populate the postedBy field with all needed fields
      const populatedProperty = await Property.findById(property._id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage createdAt updatedAt');
      
      // Format the response to ensure consistent structure
      const responseProperty = {
        ...populatedProperty.toObject(),
        postedBy: {
          id: populatedProperty.postedBy._id,
          firstName: populatedProperty.postedBy.firstName,
          lastName: populatedProperty.postedBy.lastName,
          email: populatedProperty.postedBy.email,
          phone: populatedProperty.postedBy.phone,
          userType: populatedProperty.postedBy.userType,
          profileImage: populatedProperty.postedBy.profileImage,
          avatar: populatedProperty.postedBy.profileImage // Add avatar as alias
        }
      };
      
      res.status(201).json({
        success: true,
        message: 'Property created successfully',
        property: responseProperty
      });
      
    } catch (error) {
      console.error('Create property error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating property',
        error: error.message
      });
    }
  }
  
  // Get all properties (with filters) - Featured First - FIXED
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
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .sort({ featured: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      // Format properties with consistent structure - FIXED
      const formattedProperties = properties.map(property => {
        const propertyObj = property.toObject();
        
        // Ensure postedBy has both profileImage and avatar fields
        let postedByData = {};
        if (propertyObj.postedBy) {
          postedByData = {
            id: propertyObj.postedBy._id,
            firstName: propertyObj.postedBy.firstName,
            lastName: propertyObj.postedBy.lastName,
            email: propertyObj.postedBy.email,
            phone: propertyObj.postedBy.phone,
            userType: propertyObj.postedBy.userType,
            profileImage: propertyObj.postedBy.profileImage || '',
            avatar: propertyObj.postedBy.profileImage || '' // Add avatar as alias
          };
        }
        
        // Ensure agent has both profileImage and avatar fields
        let agentData = {};
        if (propertyObj.agent) {
          agentData = {
            ...propertyObj.agent,
            profileImage: propertyObj.agent.profileImage || propertyObj.agent.avatar || '',
            avatar: propertyObj.agent.avatar || propertyObj.agent.profileImage || ''
          };
        }
        
        return {
          ...propertyObj,
          postedBy: postedByData,
          agent: agentData,
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

  // Get single property by ID - FIXED
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
      
      // Ensure postedBy has consistent structure
      if (property.postedBy) {
        property.postedBy = {
          id: property.postedBy._id,
          firstName: property.postedBy.firstName,
          lastName: property.postedBy.lastName,
          email: property.postedBy.email,
          phone: property.postedBy.phone,
          userType: property.postedBy.userType,
          profileImage: property.postedBy.profileImage || '',
          avatar: property.postedBy.profileImage || '' // Add avatar as alias
        };
      }
      
      // Ensure agent has consistent structure
      if (property.agent) {
        property.agent = {
          ...property.agent,
          profileImage: property.agent.profileImage || property.agent.avatar || '',
          avatar: property.agent.avatar || property.agent.profileImage || ''
        };
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
  
  // Update property - FIXED
  async updateProperty(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
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
          message: 'Not authorized to update this property'
        });
      }
      
      // Handle image updates
      let images = property.images || [];
      
      // Delete specified images from Cloudinary
      if (req.body.imagesToDelete) {
        const imagesToDelete = Array.isArray(req.body.imagesToDelete) 
          ? req.body.imagesToDelete 
          : req.body.imagesToDelete.split(',');
        
        // Filter out deleted images and remove from Cloudinary
        const imagesToRemove = images.filter(img => imagesToDelete.includes(img.public_id));
        
        // Delete from Cloudinary
        const deletePromises = imagesToRemove.map(async (img) => {
          if (img.public_id) {
            await cloudinary.uploader.destroy(img.public_id);
          }
        });
        await Promise.all(deletePromises);
        
        // Update images array
        images = images.filter(img => !imagesToDelete.includes(img.public_id));
      }
      
      // Add new images to Cloudinary
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file, index) => {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'properties',
            public_id: `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            transformation: [
              { width: 1200, height: 800, crop: 'fill', quality: 'auto:good' }
            ]
          });
          
          return {
            url: result.secure_url,
            public_id: result.public_id,
            isPrimary: images.length === 0 && index === 0,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          };
        });
        
        const newImages = await Promise.all(uploadPromises);
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
          ? updateData.amenities 
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
      ).populate('postedBy', 'firstName lastName email phone userType profileImage');
      
      // Format response
      const responseProperty = {
        ...updatedProperty.toObject(),
        postedBy: updatedProperty.postedBy ? {
          id: updatedProperty.postedBy._id,
          firstName: updatedProperty.postedBy.firstName,
          lastName: updatedProperty.postedBy.lastName,
          email: updatedProperty.postedBy.email,
          phone: updatedProperty.postedBy.phone,
          userType: updatedProperty.postedBy.userType,
          profileImage: updatedProperty.postedBy.profileImage || '',
          avatar: updatedProperty.postedBy.profileImage || ''
        } : null
      };
      
      res.status(200).json({
        success: true,
        message: 'Property updated successfully',
        property: responseProperty
      });
      
    } catch (error) {
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
      
      // Delete images from Cloudinary
      if (property.images && property.images.length > 0) {
        const deletePromises = property.images.map(async (img) => {
          if (img.public_id) {
            await cloudinary.uploader.destroy(img.public_id);
          }
        });
        await Promise.all(deletePromises);
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
  
  // Get user's properties - FIXED
  async getUserProperties(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const properties = await Property.find({ postedBy: req.user.id })
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format properties with consistent structure
      const formattedProperties = properties.map(property => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (property.postedBy) {
          postedByData = {
            id: property.postedBy._id,
            firstName: property.postedBy.firstName,
            lastName: property.postedBy.lastName,
            email: property.postedBy.email,
            phone: property.postedBy.phone,
            userType: property.postedBy.userType,
            profileImage: property.postedBy.profileImage || '',
            avatar: property.postedBy.profileImage || ''
          };
        }
        
        return {
          ...property,
          postedBy: postedByData,
          createdAtFormatted: moment(property.createdAt).fromNow(),
          updatedAtFormatted: moment(property.updatedAt).fromNow(),
          availableDateFormatted: property.availableDate ? 
            moment(property.availableDate).format('MMMM Do, YYYY') : null
        };
      });
      
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
  
  // Get related properties - FIXED
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
      .populate('postedBy', 'firstName lastName userType profileImage')
      .limit(4)
      .sort({ featured: -1, createdAt: -1 })
      .lean();
      
      // Format properties with consistent structure
      const formattedProperties = relatedProperties.map(prop => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (prop.postedBy) {
          postedByData = {
            id: prop.postedBy._id,
            firstName: prop.postedBy.firstName,
            lastName: prop.postedBy.lastName,
            userType: prop.postedBy.userType,
            profileImage: prop.postedBy.profileImage || '',
            avatar: prop.postedBy.profileImage || ''
          };
        }
        
        return {
          ...prop,
          postedBy: postedByData,
          createdAtFormatted: moment(prop.createdAt).fromNow()
        };
      });
      
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
  
  // Get saved properties - FIXED
  async getSavedProperties(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .populate({
          path: 'savedProperties',
          populate: {
            path: 'postedBy',
            select: 'firstName lastName userType profileImage'
          },
          options: { sort: { createdAt: -1 } }
        })
        .lean();
      
      // Format properties with consistent structure
      const formattedProperties = (user.savedProperties || []).map(property => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (property.postedBy) {
          postedByData = {
            id: property.postedBy._id,
            firstName: property.postedBy.firstName,
            lastName: property.postedBy.lastName,
            userType: property.postedBy.userType,
            profileImage: property.postedBy.profileImage || '',
            avatar: property.postedBy.profileImage || ''
          };
        }
        
        return {
          ...property,
          postedBy: postedByData,
          createdAtFormatted: moment(property.createdAt).fromNow()
        };
      });
      
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
  
  // Get featured properties - FIXED
  async getFeaturedProperties(req, res) {
    try {
      const properties = await Property.find({
        featured: true,
        isActive: true,
        isVerified: true
      })
      .populate('postedBy', 'firstName lastName userType profileImage')
      .limit(6)
      .sort({ createdAt: -1 })
      .lean();
      
      // Format properties with consistent structure
      const formattedProperties = properties.map(property => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (property.postedBy) {
          postedByData = {
            id: property.postedBy._id,
            firstName: property.postedBy.firstName,
            lastName: property.postedBy.lastName,
            userType: property.postedBy.userType,
            profileImage: property.postedBy.profileImage || '',
            avatar: property.postedBy.profileImage || ''
          };
        }
        
        return {
          ...property,
          postedBy: postedByData,
          createdAtFormatted: moment(property.createdAt).fromNow()
        };
      });
      
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
  
  // In propertyController.js
  async getPropertiesByAgent(req, res) {
    try {
      const { agentId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;

      // Find properties where postedBy OR agent.id matches agentId
      const query = {
        $or: [
          { postedBy: agentId },
          { 'agent.id': agentId }
        ],
        isActive: true,
        isVerified: true
      };

      const total = await Property.countDocuments(query);
      
      const properties = await Property.find(query)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .sort({ featured: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        properties,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });

    } catch (error) {
      console.error('Get properties by agent error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching agent properties',
        error: error.message
      });
    }
  }
}

module.exports = new PropertyController();