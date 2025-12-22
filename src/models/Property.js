const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters']
  },
  description: {
    type: String,
    required: [true, 'Property description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters']
  },
  detailedDescription: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Property type is required'],
    enum: [
      'apartment', 'duplex', 'villa', 'bungalow', 'townhouse',
      'penthouse', 'studio', 'land', 'commercial', 'mansion'
    ],
    lowercase: true
  },
  status: {
    type: String,
    required: [true, 'Property status is required'],
    enum: ['for-sale', 'for-rent', 'sold', 'rented', 'pending'],
    default: 'for-sale'
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  priceNegotiable: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    enum: [
      'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano',
      'Benin City', 'Uyo', 'Calabar', 'Enugu', 'Aba', 'Other'
    ]
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  areaName: {
    type: String,
    trim: true
  },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  bedrooms: {
    type: Number,
    required: [true, 'Number of bedrooms is required'],
    min: [0, 'Bedrooms cannot be negative'],
    max: [50, 'Maximum 50 bedrooms allowed']
  },
  bathrooms: {
    type: Number,
    required: [true, 'Number of bathrooms is required'],
    min: [0, 'Bathrooms cannot be negative'],
    max: [30, 'Maximum 30 bathrooms allowed']
  },
  area: {
    type: Number,
    required: [true, 'Area is required'],
    min: [0, 'Area cannot be negative']
  },
  areaUnit: {
    type: String,
    enum: ['sq m', 'sq ft', 'acres', 'hectares'],
    default: 'sq m'
  },
  yearBuilt: {
    type: Number,
    min: [1800, 'Year must be reasonable']
  },
  amenities: [{
    type: String,
    trim: true
  }],
  images: [{
    url: { type: String, required: true },
    public_id: { type: String },
    isPrimary: { type: Boolean, default: false },
    filename: { type: String },
    originalname: { type: String },
    mimetype: { type: String },
    size: { type: Number }
  }],
  featured: {
    type: Boolean,
    default: false
  },
  virtualTour: {
    type: String,
    trim: true
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  agent: {
    name: { type: String, required: true },
    role: { type: String, default: 'Real Estate Agent' },
    phone: { type: String },
    email: { type: String },
    avatar: { type: String }
  },
  contactInfo: {
    phone: { type: String, required: true },
    email: { type: String },
    whatsapp: { type: String }
  },
  availability: {
    type: String,
    enum: ['immediately', 'in-30-days', 'in-60-days', 'specific-date', 'negotiable'],
    default: 'immediately'
  },
  availableDate: {
    type: Date
  },
  propertyId: {
    type: String,
    unique: true,
    sparse: true
  },
  views: {
    type: Number,
    default: 0
  },
  saves: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationNotes: {
    type: String
  },
  neighborhood: {
    description: { type: String },
    landmarks: [String],
    schools: [String],
    hospitals: [String],
    shopping: [String]
  },
  additionalFeatures: {
    parkingSpaces: { type: Number, default: 0 },
    hasPool: { type: Boolean, default: false },
    hasGarden: { type: Boolean, default: false },
    hasGym: { type: Boolean, default: false },
    securityType: { type: String },
    furnished: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Generate property ID before saving
propertySchema.pre('save', async function() {
  // Generate property ID if not exists
  if (!this.propertyId) {
    const locationCode = this.location.substring(0, 3).toUpperCase();
    const typeCode = this.type.substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    this.propertyId = `PR-${locationCode}-${typeCode}-${randomNum}`;
  }
  
  // Set agent info from postedBy if not provided
  if (!this.agent.name && this.populated('postedBy')) {
    const user = await mongoose.model('User').findById(this.postedBy);
    if (user) {
      this.agent = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.userType === 'agent-landlord' ? 'Real Estate Agent' : 'Landlord',
        phone: user.phone || '',
        email: user.email,
        avatar: user.profileImage || ''
      };
    }
  }
});

// Indexes for better query performance
propertySchema.index({ location: 1, price: 1 });
propertySchema.index({ type: 1, status: 1 });
propertySchema.index({ postedBy: 1 });
propertySchema.index({ coordinates: '2dsphere' });
propertySchema.index({ isActive: 1, isVerified: 1 });

// Virtual for full location
propertySchema.virtual('fullLocation').get(function() {
  return `${this.areaName ? this.areaName + ', ' : ''}${this.location}`;
});

// Method to increment views
propertySchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Method to increment saves
propertySchema.methods.incrementSaves = async function() {
  this.saves += 1;
  await this.save();
};

// Static method for advanced search
propertySchema.statics.search = async function(filters, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const query = { isActive: true, isVerified: true };
  
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
  
  const properties = await this.find(query)
    .populate('postedBy', 'firstName lastName email phone userType')
    .sort({ featured: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);
    
  const total = await this.countDocuments(query);
  
  return {
    properties,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

const Property = mongoose.model('Property', propertySchema);
module.exports = Property;