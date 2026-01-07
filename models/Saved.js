const mongoose = require('mongoose');

const savedSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemType: {
    type: String,
    required: true,
    enum: ['property', 'service']
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: function() { return this.itemType === 'property'; }
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: function() { return this.itemType === 'service'; }
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true
  }],
  savedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique combination of user and item
savedSchema.index({ user: 1, property: 1 }, { 
  unique: true, 
  partialFilterExpression: { itemType: 'property' } 
});
savedSchema.index({ user: 1, service: 1 }, { 
  unique: true, 
  partialFilterExpression: { itemType: 'service' } 
});

// Index for faster queries
savedSchema.index({ user: 1, savedAt: -1 });
savedSchema.index({ itemType: 1, savedAt: -1 });

// Method to get item details
savedSchema.methods.getItem = async function() {
  if (this.itemType === 'property' && this.property) {
    await this.populate({
      path: 'property',
      populate: {
        path: 'postedBy',
        select: 'firstName lastName email phone userType profileImage'
      }
    });
    return this.property;
  } else if (this.itemType === 'service' && this.service) {
    await this.populate({
      path: 'service',
      populate: [
        {
          path: 'postedBy',
          select: 'firstName lastName email phone userType profileImage'
        },
        {
          path: 'provider.id',
          select: 'firstName lastName profileImage'
        }
      ]
    });
    return this.service;
  }
  return null;
};

// Static method to get all saved items for a user
savedSchema.statics.getUserSavedItems = async function(userId, options = {}) {
  const { 
    itemType, 
    page = 1, 
    limit = 20, 
    sortBy = 'savedAt', 
    sortOrder = -1 
  } = options;
  
  const skip = (page - 1) * limit;
  const query = { user: userId };
  
  if (itemType && itemType !== 'all') {
    query.itemType = itemType;
  }
  
  const [savedItems, total] = await Promise.all([
    this.find(query)
      .populate({
        path: 'property',
        populate: {
          path: 'postedBy',
          select: 'firstName lastName userType profileImage'
        }
      })
      .populate({
        path: 'service',
        populate: [
          {
            path: 'postedBy',
            select: 'firstName lastName userType profileImage'
          },
          {
            path: 'provider.id',
            select: 'firstName lastName profileImage'
          }
        ]
      })
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    
    this.countDocuments(query)
  ]);
  
  // Process items to have consistent structure
  const processedItems = savedItems.map(item => {
    const baseItem = {
      id: item._id,
      type: item.itemType,
      savedAt: item.savedAt,
      notes: item.notes,
      tags: item.tags
    };
    
    if (item.itemType === 'property' && item.property) {
      return {
        ...baseItem,
        _id: item.property._id,
        title: item.property.title,
        price: item.property.price,
        location: item.property.location,
        address: item.property.address,
        type: item.property.type,
        status: item.property.status,
        featured: item.property.featured,
        bedrooms: item.property.bedrooms,
        bathrooms: item.property.bathrooms,
        area: item.property.area,
        description: item.property.description,
        images: item.property.images,
        agent: item.property.agent || (item.property.postedBy ? {
          name: `${item.property.postedBy.firstName} ${item.property.postedBy.lastName}`,
          avatar: item.property.postedBy.profileImage,
          role: item.property.postedBy.userType === 'agent-landlord' ? 'Real Estate Agent' : 'Landlord'
        } : null)
      };
    } else if (item.itemType === 'service' && item.service) {
      return {
        ...baseItem,
        _id: item.service._id,
        title: item.service.title,
        price: item.service.price,
        pricingType: item.service.pricingType,
        location: item.service.location,
        category: item.service.category,
        featured: item.service.featured,
        description: item.service.description,
        duration: item.service.duration,
        rating: item.service.rating,
        completedJobs: item.service.completedJobs,
        experienceLevel: item.service.experienceLevel,
        insurance: item.service.insurance,
        images: item.service.images,
        provider: {
          name: item.service.provider?.name || `${item.service.postedBy?.firstName} ${item.service.postedBy?.lastName}`,
          avatar: item.service.provider?.avatar || item.service.postedBy?.profileImage,
          specialization: item.service.provider?.specialization
        }
      };
    }
    
    return baseItem;
  }).filter(item => item._id); // Remove items where the referenced item doesn't exist
  
  return {
    items: processedItems,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

const Saved = mongoose.model('Saved', savedSchema);
module.exports = Saved;