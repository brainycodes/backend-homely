const Property = require('../models/Property');
const User = require('../models/User');

// @desc    Get pending properties (not verified or not active)
// @route   GET /api/admin/properties/pending
// @access  Private (Admin with manageProperties permission)
exports.getPendingProperties = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage properties'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find properties that are not verified OR not active OR pending
    const query = {
      $or: [
        { isVerified: false },
        { isActive: false },
        { status: 'pending' }
      ]
    };

    // Apply filters if provided
    if (req.query.type) query.type = req.query.type;
    if (req.query.location) query.location = req.query.location;
    if (req.query.status) query.status = req.query.status;
    
    // Search functionality
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { address: { $regex: req.query.search, $options: 'i' } },
        { 'agent.name': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const properties = await Property.find(query)
      .populate('postedBy', 'firstName lastName email phone userType profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(query);

    // Calculate statistics - including featured properties
    const stats = {
      pending: await Property.countDocuments({ 
        $or: [
          { isVerified: false },
          { isActive: false }
        ]
      }),
      inactive: await Property.countDocuments({ isActive: false }),
      unverified: await Property.countDocuments({ isVerified: false }),
      featured: await Property.countDocuments({ featured: true }), // Add featured count
      total: total
    };

    // Construct full image URLs with protocol and host
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formattedProperties = properties.map(property => {
      const propertyObj = property.toObject();
      
      // Handle image URLs - IMPORTANT: Fix image URLs
      if (propertyObj.images && Array.isArray(propertyObj.images)) {
        propertyObj.images = propertyObj.images.map(img => {
          // If image URL is already a full URL or data URL, use it as is
          if (img.url && (img.url.startsWith('http') || img.url.startsWith('data:'))) {
            return img;
          }
          
          // If it's a relative path (starts with /uploads), prepend with base URL
          if (img.url && img.url.startsWith('/uploads')) {
            return {
              ...img,
              url: `${baseUrl}${img.url}`
            };
          }
          
          // If it's just a filename (from older uploads), construct the full path
          if (img.filename) {
            return {
              ...img,
              url: `${baseUrl}/uploads/properties/${img.filename}`
            };
          }
          
          // If URL exists but doesn't start with /, assume it's a filename
          if (img.url && !img.url.startsWith('/') && !img.url.startsWith('http')) {
            return {
              ...img,
              url: `${baseUrl}/uploads/properties/${img.url}`
            };
          }
          
          return img;
        });
      }
      
      return propertyObj;
    });

    res.json({
      success: true,
      data: formattedProperties,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats
    });

  } catch (error) {
    console.error('Get pending properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get pending property by ID
// @route   GET /api/admin/properties/pending/:id
// @access  Private (Admin with manageProperties permission)
exports.getPendingPropertyById = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage properties'
      });
    }

    const property = await Property.findById(req.params.id)
      .populate('postedBy', 'firstName lastName email phone userType profileImage createdAt');

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    res.json({
      success: true,
      data: property
    });

  } catch (error) {
    console.error('Get pending property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Approve property (and optionally mark as featured)
// @route   PUT /api/admin/properties/:id/approve
// @access  Private (Admin with manageProperties permission)
exports.approveProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve properties'
      });
    }

    const { verificationNotes, makeFeatured = true } = req.body;

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Update property
    property.isVerified = true;
    property.isActive = true;
    
    // Automatically mark as featured when approving (default is true)
    property.featured = makeFeatured;
    
    if (verificationNotes) {
      property.verificationNotes = verificationNotes;
    }
    
    // If it was pending status, change to appropriate status
    if (property.status === 'pending') {
      property.status = property.type === 'land' ? 'for-sale' : 'for-rent';
    }

    await property.save();

    // Populate before sending response
    const populatedProperty = await Property.findById(property._id)
      .populate('postedBy', 'firstName lastName email phone');

    res.json({
      success: true,
      message: `Property approved successfully${makeFeatured ? ' and marked as featured' : ''}`,
      data: populatedProperty
    });

  } catch (error) {
    console.error('Approve property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Decline/Reject property
// @route   PUT /api/admin/properties/:id/decline
// @access  Private (Admin with manageProperties permission)
exports.declineProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to decline properties'
      });
    }

    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for declining (minimum 5 characters)'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Update property
    property.isActive = false;
    property.verificationNotes = `Declined: ${reason.trim()}`;
    property.status = 'pending'; // Keep as pending for admin review
    property.featured = false; // Ensure declined properties are not featured
    
    await property.save();

    res.json({
      success: true,
      message: 'Property declined successfully',
      data: {
        id: property._id,
        isActive: property.isActive,
        verificationNotes: property.verificationNotes
      }
    });

  } catch (error) {
    console.error('Decline property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Request changes for property
// @route   PUT /api/admin/properties/:id/request-changes
// @access  Private (Admin with manageProperties permission)
exports.requestPropertyChanges = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to request property changes'
      });
    }

    const { changesRequested } = req.body;

    if (!changesRequested || changesRequested.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide detailed changes requested (minimum 10 characters)'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Update property with changes requested
    property.verificationNotes = `Changes Requested: ${changesRequested.trim()}`;
    property.status = 'pending';
    
    await property.save();

    res.json({
      success: true,
      message: 'Changes requested successfully',
      data: {
        id: property._id,
        verificationNotes: property.verificationNotes,
        status: property.status
      }
    });

  } catch (error) {
    console.error('Request changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get property statistics
// @route   GET /api/admin/properties/stats
// @access  Private (Admin with manageProperties permission)
exports.getPropertyStats = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view property stats'
      });
    }

    const stats = {
      total: await Property.countDocuments(),
      verified: await Property.countDocuments({ isVerified: true }),
      unverified: await Property.countDocuments({ isVerified: false }),
      active: await Property.countDocuments({ isActive: true }),
      inactive: await Property.countDocuments({ isActive: false }),
      featured: await Property.countDocuments({ featured: true }), // Add featured count
      pendingReview: await Property.countDocuments({ 
        $or: [
          { isVerified: false },
          { isActive: false }
        ]
      }),
      byType: await Property.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      byLocation: await Property.aggregate([
        { $group: { _id: '$location', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      byStatus: await Property.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get property stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all properties with filters
// @route   GET /api/admin/properties
// @access  Private (Admin with manageProperties permission)
exports.getAllProperties = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage properties'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    // Apply filters
    if (req.query.type) query.type = req.query.type;
    if (req.query.location) query.location = req.query.location;
    if (req.query.status) query.status = req.query.status;
    if (req.query.isVerified === 'true') query.isVerified = true;
    if (req.query.isVerified === 'false') query.isVerified = false;
    if (req.query.featured === 'true') query.featured = true;
    if (req.query.featured === 'false') query.featured = false;
    if (req.query.isActive === 'true') query.isActive = true;
    if (req.query.isActive === 'false') query.isActive = false;
    
    // Search functionality
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { address: { $regex: req.query.search, $options: 'i' } },
        { 'agent.name': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const properties = await Property.find(query)
      .populate('postedBy', 'firstName lastName email phone userType profileImage')
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(query);

    // Construct full image URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formattedProperties = properties.map(property => {
      const propertyObj = property.toObject();
      
      // Handle image URLs
      if (propertyObj.images && Array.isArray(propertyObj.images)) {
        propertyObj.images = propertyObj.images.map(img => {
          if (img.url && (img.url.startsWith('http') || img.url.startsWith('data:'))) {
            return img;
          }
          
          if (img.url && img.url.startsWith('/uploads')) {
            return {
              ...img,
              url: `${baseUrl}${img.url}`
            };
          }
          
          if (img.filename) {
            return {
              ...img,
              url: `${baseUrl}/uploads/properties/${img.filename}`
            };
          }
          
          if (img.url && !img.url.startsWith('/') && !img.url.startsWith('http')) {
            return {
              ...img,
              url: `${baseUrl}/uploads/properties/${img.url}`
            };
          }
          
          return img;
        });
      }
      
      return propertyObj;
    });

    res.json({
      success: true,
      data: formattedProperties,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get all properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get featured properties stats
// @route   GET /api/admin/properties/featured-stats
// @access  Private (Admin with manageProperties permission)
exports.getFeaturedStats = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view property stats'
      });
    }

    const stats = {
      totalFeatured: await Property.countDocuments({ featured: true }),
      activeFeatured: await Property.countDocuments({ featured: true, isActive: true }),
      forSaleFeatured: await Property.countDocuments({ featured: true, status: 'for-sale' }),
      forRentFeatured: await Property.countDocuments({ featured: true, status: 'for-rent' }),
      byLocation: await Property.aggregate([
        { $match: { featured: true } },
        { $group: { _id: '$location', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).then(results => results.map(item => ({
        location: item._id,
        count: item.count
      })))
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get featured stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Toggle property verification
// @route   PUT /api/admin/properties/:id/verify
// @access  Private (Admin with manageProperties permission)
exports.verifyProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to verify properties'
      });
    }

    const { verificationNotes } = req.body;

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    property.isVerified = true;
    if (verificationNotes) {
      property.verificationNotes = verificationNotes;
    }
    
    await property.save();

    res.json({
      success: true,
      message: 'Property verified successfully',
      data: property
    });

  } catch (error) {
    console.error('Verify property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Unverify property
// @route   PUT /api/admin/properties/:id/unverify
// @access  Private (Admin with manageProperties permission)
exports.unverifyProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to unverify properties'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    property.isVerified = false;
    property.verificationNotes = `Unverified by admin on ${new Date().toLocaleDateString()}`;
    
    await property.save();

    res.json({
      success: true,
      message: 'Property unverified successfully',
      data: property
    });

  } catch (error) {
    console.error('Unverify property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Activate property
// @route   PUT /api/admin/properties/:id/activate
// @access  Private (Admin with manageProperties permission)
exports.activateProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to activate properties'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    property.isActive = true;
    
    await property.save();

    res.json({
      success: true,
      message: 'Property activated successfully',
      data: property
    });

  } catch (error) {
    console.error('Activate property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Deactivate property
// @route   PUT /api/admin/properties/:id/deactivate
// @access  Private (Admin with manageProperties permission)
exports.deactivateProperty = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to deactivate properties'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    property.isActive = false;
    
    await property.save();

    res.json({
      success: true,
      message: 'Property deactivated successfully',
      data: property
    });

  } catch (error) {
    console.error('Deactivate property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Toggle property featured status
// @route   PUT /api/admin/properties/:id/toggle-featured
// @access  Private (Admin with manageProperties permission)
exports.toggleFeatured = async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions?.manageProperties && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to toggle featured status'
      });
    }

    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    property.featured = !property.featured;
    
    await property.save();

    res.json({
      success: true,
      message: property.featured ? 'Property featured successfully' : 'Property unfeatured successfully',
      data: property
    });

  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};