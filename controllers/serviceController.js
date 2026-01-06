const Service = require('../models/Service');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { validationResult } = require('express-validator');
const moment = require('moment');
const cloudinary = require('../config/cloudinary');

class ServiceController {
  // Create new service - FIXED
  async createService(req, res) {
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
      
      // Check if user is agent-landlord or service provider
      if (user.userType !== 'agent-landlord' && user.userType !== 'service-provider') {
        return res.status(403).json({
          success: false,
          message: 'Only agents, landlords, and service providers can create services'
        });
      }
      
      // Handle image upload to Cloudinary
      let images = [];
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file, index) => {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'services',
            public_id: `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      }
      
      // Create service data - FIXED: Use consistent field names
      const serviceData = {
        ...req.body,
        postedBy: userId,
        images,
        provider: {
          id: userId,
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.profileImage || '', // Use profileImage as avatar
          profileImage: user.profileImage || '', // Also include profileImage field
          specialization: req.body.specialization || user.specialization || '',
          rating: 0,
          experience: user.experience || '',
          teamSize: req.body.teamSize || 1,
          languages: Array.isArray(req.body.languages) 
            ? req.body.languages 
            : req.body.languages?.split(',').map(lang => lang.trim()) || [],
          certifications: Array.isArray(req.body.certifications)
            ? req.body.certifications
            : req.body.certifications?.split(',').map(cert => cert.trim()) || [],
          bio: req.body.bio || user.bio || ''
        },
        contactInfo: {
          phone: req.body.contactPhone || user.phone,
          email: req.body.contactEmail || user.email,
          whatsapp: req.body.contactWhatsapp || user.phone
        }
      };
      
      // Convert string arrays to arrays
      if (req.body.servicesIncluded) {
        serviceData.servicesIncluded = Array.isArray(req.body.servicesIncluded)
          ? req.body.servicesIncluded
          : req.body.servicesIncluded.split(',').map(item => item.trim());
      }
      
      if (req.body.tags) {
        serviceData.tags = Array.isArray(req.body.tags)
          ? req.body.tags
          : req.body.tags.split(',').map(item => item.trim());
      }
      
      if (req.body.serviceAreas) {
        serviceData.serviceAreas = Array.isArray(req.body.serviceAreas)
          ? req.body.serviceAreas
          : req.body.serviceAreas.split(',').map(item => item.trim());
      }
      
      // Parse packages if provided
      if (req.body.packages) {
        try {
          serviceData.packages = JSON.parse(req.body.packages);
          
          // Filter out packages with empty prices or names
          serviceData.packages = serviceData.packages.filter(pkg => 
            pkg && pkg.name && pkg.name.trim() !== '' && pkg.price !== null && pkg.price !== undefined && pkg.price !== ''
          );
          
          // Set default values for empty packages array
          if (serviceData.packages.length === 0) {
            serviceData.packages = [];
          }
        } catch (error) {
          console.error('Error parsing packages:', error);
          serviceData.packages = [];
        }
      }
      
      // Parse numbers
      serviceData.price = parseFloat(req.body.price);
      serviceData.completedJobs = parseInt(req.body.completedJobs || 0);
      serviceData.teamSize = parseInt(req.body.teamSize || 1);
      
      const service = new Service(serviceData);
      await service.save();
      
      // Populate the postedBy and provider fields
      const populatedService = await Service.findById(service._id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage');
      
      // Format the response to ensure consistent structure
      const responseService = {
        ...populatedService.toObject(),
        postedBy: populatedService.postedBy ? {
          id: populatedService.postedBy._id,
          firstName: populatedService.postedBy.firstName,
          lastName: populatedService.postedBy.lastName,
          email: populatedService.postedBy.email,
          phone: populatedService.postedBy.phone,
          userType: populatedService.postedBy.userType,
          profileImage: populatedService.postedBy.profileImage,
          avatar: populatedService.postedBy.profileImage
        } : null,
        provider: {
          ...populatedService.provider,
          profileImage: populatedService.provider.profileImage || populatedService.provider.avatar || '',
          avatar: populatedService.provider.avatar || populatedService.provider.profileImage || ''
        }
      };
      
      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        service: responseService
      });
      
    } catch (error) {
      console.error('Create service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating service',
        error: error.message
      });
    }
  }
  
  // Get all services (with filters) - FIXED
  async getAllServices(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const filters = req.query;
      
      const skip = (page - 1) * limit;
      const query = { isActive: true, isVerified: true };
      
      // Apply filters
      if (filters.category && filters.category !== 'all') query.category = filters.category;
      if (filters.location && filters.location !== 'all') query.location = filters.location;
      if (filters.experienceLevel && filters.experienceLevel !== 'all') {
        query.experienceLevel = filters.experienceLevel;
      }
      if (filters.minPrice) query.price = { ...query.price, $gte: parseFloat(filters.minPrice) };
      if (filters.maxPrice) query.price = { ...query.price, $lte: parseFloat(filters.maxPrice) };
      if (filters.minRating) query.rating = { $gte: parseFloat(filters.minRating) };
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { 'provider.name': { $regex: filters.search, $options: 'i' } },
          { tags: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Sort options
      let sort = { featured: -1, createdAt: -1 };
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'price-low':
            sort = { price: 1 };
            break;
          case 'price-high':
            sort = { price: -1 };
            break;
          case 'rating':
            sort = { rating: -1 };
            break;
          case 'jobs':
            sort = { completedJobs: -1 };
            break;
          case 'newest':
            sort = { createdAt: -1 };
            break;
          case 'featured':
            sort = { featured: -1, createdAt: -1 };
            break;
        }
      }
      
      // Get total count
      const total = await Service.countDocuments(query);
      
      // Get services
      const services = await Service.find(query)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .sort(sort)
        .skip(skip)
        .limit(limit);
      
      // Format services with consistent structure - FIXED
      const formattedServices = services.map(service => {
        const serviceObj = service.toObject();
        
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (serviceObj.postedBy) {
          postedByData = {
            id: serviceObj.postedBy._id,
            firstName: serviceObj.postedBy.firstName,
            lastName: serviceObj.postedBy.lastName,
            email: serviceObj.postedBy.email,
            phone: serviceObj.postedBy.phone,
            userType: serviceObj.postedBy.userType,
            profileImage: serviceObj.postedBy.profileImage || '',
            avatar: serviceObj.postedBy.profileImage || ''
          };
        }
        
        // Ensure provider has consistent structure
        let providerData = {};
        if (serviceObj.provider) {
          // Get profileImage from populated provider.id if available
          const profileImage = serviceObj.provider.id?.profileImage || 
                              serviceObj.provider.profileImage || 
                              serviceObj.provider.avatar || '';
          
          providerData = {
            ...serviceObj.provider,
            profileImage: profileImage,
            avatar: profileImage // Use same value for both
          };
        }
        
        return {
          ...serviceObj,
          postedBy: postedByData,
          provider: providerData,
          createdAtFormatted: moment(service.createdAt).fromNow(),
          updatedAtFormatted: moment(service.updatedAt).fromNow()
        };
      });
      
      res.status(200).json({
        success: true,
        services: formattedServices,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get services error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching services',
        error: error.message
      });
    }
  }

  // Get single service by ID - FIXED
  async getServiceById(req, res) {
    try {
      const service = await Service.findById(req.params.id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .populate('reviews.user', 'firstName lastName')
        .lean();
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Ensure postedBy has consistent structure
      if (service.postedBy) {
        service.postedBy = {
          id: service.postedBy._id,
          firstName: service.postedBy.firstName,
          lastName: service.postedBy.lastName,
          email: service.postedBy.email,
          phone: service.postedBy.phone,
          userType: service.postedBy.userType,
          profileImage: service.postedBy.profileImage || '',
          avatar: service.postedBy.profileImage || ''
        };
      }
      
      // Ensure provider has consistent structure
      if (service.provider) {
        // Get profileImage from populated provider.id if available
        const profileImage = service.provider.id?.profileImage || 
                            service.provider.profileImage || 
                            service.provider.avatar || '';
        
        service.provider = {
          ...service.provider,
          profileImage: profileImage,
          avatar: profileImage // Use same value for both
        };
      }
      
      // Format dates using moment
      service.createdAtFormatted = moment(service.createdAt).fromNow();
      service.updatedAtFormatted = moment(service.updatedAt).fromNow();
      
      // Increment views
      await Service.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
      
      res.status(200).json({
        success: true,
        service
      });
      
    } catch (error) {
      console.error('Get service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching service',
        error: error.message
      });
    }
  }
  
  // Update service - FIXED
  async updateService(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Check if user owns the service or is admin
      if (service.postedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this service'
        });
      }
      
      // Handle image updates
      let images = service.images || [];
      
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
            folder: 'services',
            public_id: `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      
      // Update service data
      const updateData = {
        ...req.body,
        images
      };
      
      // Convert string arrays to arrays
      if (req.body.servicesIncluded) {
        updateData.servicesIncluded = Array.isArray(req.body.servicesIncluded)
          ? updateData.servicesIncluded
          : req.body.servicesIncluded.split(',').map(item => item.trim());
      }
      
      if (req.body.tags) {
        updateData.tags = Array.isArray(req.body.tags)
          ? updateData.tags
          : req.body.tags.split(',').map(item => item.trim());
      }
      
      // Parse packages if provided
      if (req.body.packages) {
        try {
          updateData.packages = JSON.parse(req.body.packages);
          
          // Filter out packages with empty prices or names
          updateData.packages = updateData.packages.filter(pkg => 
            pkg && pkg.name && pkg.name.trim() !== '' && pkg.price !== null && pkg.price !== undefined && pkg.price !== ''
          );
          
          // Set default values for empty packages array
          if (updateData.packages.length === 0) {
            updateData.packages = [];
          }
        } catch (error) {
          console.error('Error parsing packages:', error);
          updateData.packages = [];
        }
      }
      
      // Parse numbers
      if (req.body.price) updateData.price = parseFloat(req.body.price);
      if (req.body.completedJobs) updateData.completedJobs = parseInt(req.body.completedJobs);
      if (req.body.teamSize) updateData.teamSize = parseInt(req.body.teamSize);
      
      // Update provider info
      if (req.user.id.toString() === service.postedBy.toString()) {
        const user = await User.findById(req.user.id);
        if (user) {
          updateData.provider = {
            ...updateData.provider,
            name: `${user.firstName} ${user.lastName}`,
            avatar: user.profileImage || service.provider.avatar,
            profileImage: user.profileImage || service.provider.profileImage || service.provider.avatar,
            bio: req.body.bio || user.bio || service.provider.bio
          };
        }
      }
      
      const updatedService = await Service.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('postedBy', 'firstName lastName email phone userType profileImage')
      .populate('provider.id', 'firstName lastName email phone profileImage');
      
      // Format response
      const responseService = {
        ...updatedService.toObject(),
        postedBy: updatedService.postedBy ? {
          id: updatedService.postedBy._id,
          firstName: updatedService.postedBy.firstName,
          lastName: updatedService.postedBy.lastName,
          email: updatedService.postedBy.email,
          phone: updatedService.postedBy.phone,
          userType: updatedService.postedBy.userType,
          profileImage: updatedService.postedBy.profileImage || '',
          avatar: updatedService.postedBy.profileImage || ''
        } : null,
        provider: {
          ...updatedService.provider,
          profileImage: updatedService.provider.profileImage || updatedService.provider.avatar || '',
          avatar: updatedService.provider.avatar || updatedService.provider.profileImage || ''
        }
      };
      
      res.status(200).json({
        success: true,
        message: 'Service updated successfully',
        service: responseService
      });
      
    } catch (error) {
      console.error('Update service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating service',
        error: error.message
      });
    }
  }
  
  // Delete service
  async deleteService(req, res) {
    try {
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Check if user owns the service or is admin
      if (service.postedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this service'
        });
      }
      
      // Delete images from Cloudinary
      if (service.images && service.images.length > 0) {
        const deletePromises = service.images.map(async (img) => {
          if (img.public_id) {
            await cloudinary.uploader.destroy(img.public_id);
          }
        });
        await Promise.all(deletePromises);
      }
      
      await Service.findByIdAndDelete(req.params.id);
      
      res.status(200).json({
        success: true,
        message: 'Service deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting service',
        error: error.message
      });
    }
  }
  
  // Get user's services - FIXED
  async getUserServices(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const services = await Service.find({ postedBy: req.user.id })
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format services with consistent structure
      const formattedServices = services.map(service => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (service.postedBy) {
          postedByData = {
            id: service.postedBy._id,
            firstName: service.postedBy.firstName,
            lastName: service.postedBy.lastName,
            email: service.postedBy.email,
            phone: service.postedBy.phone,
            userType: service.postedBy.userType,
            profileImage: service.postedBy.profileImage || '',
            avatar: service.postedBy.profileImage || ''
          };
        }
        
        return {
          ...service,
          postedBy: postedByData,
          createdAtFormatted: moment(service.createdAt).fromNow(),
          updatedAtFormatted: moment(service.updatedAt).fromNow()
        };
      });
      
      const total = await Service.countDocuments({ postedBy: req.user.id });
      
      res.status(200).json({
        success: true,
        services: formattedServices,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get user services error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user services',
        error: error.message
      });
    }
  }
  
  // Toggle service featured status (admin only)
  async toggleFeatured(req, res) {
    try {
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      service.featured = !service.featured;
      await service.save();
      
      res.status(200).json({
        success: true,
        message: `Service ${service.featured ? 'featured' : 'unfeatured'} successfully`,
        service
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
  
  // Verify service (admin only)
  async verifyService(req, res) {
    try {
      const { verificationNotes } = req.body;
      
      const service = await Service.findByIdAndUpdate(
        req.params.id,
        {
          isVerified: true,
          verificationNotes,
          verifiedAt: new Date()
        },
        { new: true }
      );
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Service verified successfully',
        service
      });
      
    } catch (error) {
      console.error('Verify service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error verifying service',
        error: error.message
      });
    }
  }
  
  // Get related services - FIXED
  async getRelatedServices(req, res) {
    try {
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      const relatedServices = await Service.find({
        _id: { $ne: service._id },
        $or: [
          { category: service.category },
          { location: service.location },
          { 'provider.id': service.provider.id }
        ],
        isActive: true,
        isVerified: true
      })
      .populate('postedBy', 'firstName lastName userType profileImage')
      .populate('provider.id', 'firstName lastName profileImage')
      .limit(4)
      .sort({ featured: -1, rating: -1, createdAt: -1 })
      .lean();
      
      // Format services with consistent structure
      const formattedServices = relatedServices.map(serviceItem => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (serviceItem.postedBy) {
          postedByData = {
            id: serviceItem.postedBy._id,
            firstName: serviceItem.postedBy.firstName,
            lastName: serviceItem.postedBy.lastName,
            userType: serviceItem.postedBy.userType,
            profileImage: serviceItem.postedBy.profileImage || '',
            avatar: serviceItem.postedBy.profileImage || ''
          };
        }
        
        // Ensure provider has consistent structure
        let providerData = {};
        if (serviceItem.provider) {
          const profileImage = serviceItem.provider.id?.profileImage || 
                              serviceItem.provider.profileImage || 
                              serviceItem.provider.avatar || '';
          
          providerData = {
            ...serviceItem.provider,
            profileImage: profileImage,
            avatar: profileImage
          };
        }
        
        return {
          ...serviceItem,
          postedBy: postedByData,
          provider: providerData,
          createdAtFormatted: moment(serviceItem.createdAt).fromNow()
        };
      });
      
      res.status(200).json({
        success: true,
        services: formattedServices
      });
      
    } catch (error) {
      console.error('Get related services error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching related services',
        error: error.message
      });
    }
  }
  
  // Toggle save service
  async toggleSaveService(req, res) {
    try {
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      const user = await User.findById(req.user.id);
      
      if (!user.savedServices) {
        user.savedServices = [];
      }
      
      const isSaved = user.savedServices.includes(service._id);
      
      if (isSaved) {
        // Remove from saved
        user.savedServices = user.savedServices.filter(
          id => id.toString() !== service._id.toString()
        );
        service.saves = Math.max(0, service.saves - 1);
      } else {
        // Add to saved
        user.savedServices.push(service._id);
        service.saves += 1;
      }
      
      await user.save();
      await service.save();
      
      res.status(200).json({
        success: true,
        message: `Service ${isSaved ? 'removed from' : 'added to'} saved services`,
        isSaved: !isSaved,
        saves: service.saves
      });
      
    } catch (error) {
      console.error('Toggle save error:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving service',
        error: error.message
      });
    }
  }
  
  // Get saved services - FIXED
  async getSavedServices(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .populate({
          path: 'savedServices',
          populate: [
            {
              path: 'postedBy',
              select: 'firstName lastName userType profileImage'
            },
            {
              path: 'provider.id',
              select: 'firstName lastName profileImage'
            }
          ],
          options: { sort: { createdAt: -1 } }
        })
        .lean();
      
      // Format services with consistent structure
      const formattedServices = (user.savedServices || []).map(service => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (service.postedBy) {
          postedByData = {
            id: service.postedBy._id,
            firstName: service.postedBy.firstName,
            lastName: service.postedBy.lastName,
            userType: service.postedBy.userType,
            profileImage: service.postedBy.profileImage || '',
            avatar: service.postedBy.profileImage || ''
          };
        }
        
        // Ensure provider has consistent structure
        let providerData = {};
        if (service.provider) {
          const profileImage = service.provider.id?.profileImage || 
                              service.provider.profileImage || 
                              service.provider.avatar || '';
          
          providerData = {
            ...service.provider,
            profileImage: profileImage,
            avatar: profileImage
          };
        }
        
        return {
          ...service,
          postedBy: postedByData,
          provider: providerData,
          createdAtFormatted: moment(service.createdAt).fromNow()
        };
      });
      
      res.status(200).json({
        success: true,
        services: formattedServices
      });
      
    } catch (error) {
      console.error('Get saved services error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching saved services',
        error: error.message
      });
    }
  }
  
  // Get featured services - FIXED
  async getFeaturedServices(req, res) {
    try {
      const services = await Service.find({
        featured: true,
        isActive: true,
        isVerified: true
      })
      .populate('postedBy', 'firstName lastName userType profileImage')
      .populate('provider.id', 'firstName lastName profileImage')
      .limit(6)
      .sort({ createdAt: -1 })
      .lean();
      
      // Format services with consistent structure
      const formattedServices = services.map(service => {
        // Ensure postedBy has consistent structure
        let postedByData = {};
        if (service.postedBy) {
          postedByData = {
            id: service.postedBy._id,
            firstName: service.postedBy.firstName,
            lastName: service.postedBy.lastName,
            userType: service.postedBy.userType,
            profileImage: service.postedBy.profileImage || '',
            avatar: service.postedBy.profileImage || ''
          };
        }
        
        // Ensure provider has consistent structure
        let providerData = {};
        if (service.provider) {
          const profileImage = service.provider.id?.profileImage || 
                              service.provider.profileImage || 
                              service.provider.avatar || '';
          
          providerData = {
            ...service.provider,
            profileImage: profileImage,
            avatar: profileImage
          };
        }
        
        return {
          ...service,
          postedBy: postedByData,
          provider: providerData,
          createdAtFormatted: moment(service.createdAt).fromNow()
        };
      });
      
      res.status(200).json({
        success: true,
        services: formattedServices
      });
      
    } catch (error) {
      console.error('Get featured services error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching featured services',
        error: error.message
      });
    }
  }
  
  // Get service categories
  async getServiceCategories(req, res) {
    try {
      const categories = await Service.aggregate([
        { $match: { isActive: true, isVerified: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      // Add "all" category
      const allCategories = [
        { _id: 'all', label: 'All Categories', count: await Service.countDocuments({ isActive: true, isVerified: true }) },
        ...categories.map(cat => ({
          _id: cat._id,
          label: cat._id.charAt(0).toUpperCase() + cat._id.slice(1),
          count: cat.count
        }))
      ];
      
      res.status(200).json({
        success: true,
        categories: allCategories
      });
      
    } catch (error) {
      console.error('Get service categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching service categories',
        error: error.message
      });
    }
  }
  
  // Get service stats
  async getServiceStats(req, res) {
    try {
      const userId = req.user.id;
      
      const stats = await Service.aggregate([
        { $match: { postedBy: userId } },
        {
          $group: {
            _id: null,
            totalServices: { $sum: 1 },
            totalViews: { $sum: "$views" },
            totalSaves: { $sum: "$saves" },
            avgRating: { $avg: "$rating" },
            totalCompletedJobs: { $sum: "$completedJobs" },
            featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
            verifiedCount: { $sum: { $cond: ["$isVerified", 1, 0] } }
          }
        }
      ]);
      
      // Get category breakdown
      const categoryStats = await Service.aggregate([
        { $match: { postedBy: userId } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      res.status(200).json({
        success: true,
        stats: stats[0] || {
          totalServices: 0,
          totalViews: 0,
          totalSaves: 0,
          avgRating: 0,
          totalCompletedJobs: 0,
          featuredCount: 0,
          verifiedCount: 0
        },
        categoryStats
      });
      
    } catch (error) {
      console.error('Get service stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching service stats',
        error: error.message
      });
    }
  }
  
  // Get recent activity
  async getRecentActivity(req, res) {
    try {
      const userId = req.user.id;
      
      const activities = await Service.aggregate([
        { $match: { postedBy: userId } },
        { $sort: { updatedAt: -1 } },
        { $limit: 10 },
        {
          $project: {
            title: 1,
            category: 1,
            views: 1,
            saves: 1,
            completedJobs: 1,
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
  
  // Add review to service
  async addReview(req, res) {
    try {
      const { rating, comment } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Check if user has already reviewed this service
      const existingReview = service.reviews.find(
        review => review.user.toString() === req.user.id
      );
      
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this service'
        });
      }
      
      const user = await User.findById(req.user.id);
      
      // Add review
      await service.addReview(
        req.user.id,
        `${user.firstName} ${user.lastName}`,
        parseInt(rating),
        comment
      );
      
      res.status(200).json({
        success: true,
        message: 'Review added successfully',
        service
      });
      
    } catch (error) {
      console.error('Add review error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding review',
        error: error.message
      });
    }
  }
  
  // Book a service
  async bookService(req, res) {
    try {
      const { date, time, duration, address, notes } = req.body;
      
      const service = await Service.findById(req.params.id);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Calculate total price
      let totalPrice = service.price;
      if (service.pricingType === 'hourly' && duration) {
        totalPrice = service.price * parseInt(duration);
      }
      
      // Create booking
      const booking = new Booking({
        service: service._id,
        user: req.user.id,
        provider: service.postedBy,
        date: new Date(date),
        time,
        duration: duration || '2',
        address,
        notes,
        totalPrice,
        status: 'pending'
      });
      
      await booking.save();
      
      // Populate references
      await booking.populate('service', 'title category price pricingType');
      await booking.populate('user', 'firstName lastName email phone');
      await booking.populate('provider', 'firstName lastName email phone profileImage');
      
      res.status(201).json({
        success: true,
        message: 'Service booked successfully',
        booking
      });
      
    } catch (error) {
      console.error('Book service error:', error);
      res.status(500).json({
        success: false,
        message: 'Error booking service',
        error: error.message
      });
    }
  }
  
  // Test endpoint for debugging
  async testServiceData(req, res) {
    try {
      const service = await Service.findById(req.params.id)
        .populate('postedBy', 'firstName lastName email phone userType profileImage')
        .populate('provider.id', 'firstName lastName email phone profileImage')
        .lean();
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      // Log the structure for debugging
      console.log('Service postedBy structure:', JSON.stringify(service.postedBy, null, 2));
      console.log('Service provider structure:', JSON.stringify(service.provider, null, 2));
      console.log('Service provider.id structure:', JSON.stringify(service.provider?.id, null, 2));
      
      res.status(200).json({
        success: true,
        service,
        debug: {
          postedByHasProfileImage: !!service.postedBy?.profileImage,
          providerHasProfileImage: !!service.provider?.profileImage,
          providerHasAvatar: !!service.provider?.avatar,
          providerIdHasProfileImage: !!service.provider?.id?.profileImage,
          postedByFields: Object.keys(service.postedBy || {}),
          providerFields: Object.keys(service.provider || {}),
          postedByProfileImageValue: service.postedBy?.profileImage,
          providerProfileImageValue: service.provider?.profileImage,
          providerAvatarValue: service.provider?.avatar,
          providerIdProfileImageValue: service.provider?.id?.profileImage
        }
      });
      
    } catch (error) {
      console.error('Test service data error:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing service data',
        error: error.message
      });
    }
  }
}

module.exports = new ServiceController();