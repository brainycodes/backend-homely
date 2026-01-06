const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Service title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters']
  },
  detailedDescription: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Service category is required'],
    enum: [
      'inspection', 'legal', 'moving', 'design', 'renovation',
      'security', 'cleaning', 'maintenance', 'furniture',
      'landscaping', 'smart-home', 'construction', 'plumbing',
      'electrical', 'pest-control', 'painting', 'carpentry'
    ],
    lowercase: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  
  // Pricing Information
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  pricingType: {
    type: String,
    required: [true, 'Pricing type is required'],
    enum: ['hourly', 'project', 'consultation', 'package'],
    default: 'project'
  },
  duration: {
    type: String,
    trim: true
  },
  
  // Service Provider Information
  provider: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: { type: String, required: true },
    avatar: { type: String },
    specialization: { type: String },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    experience: { type: String },
    teamSize: { type: Number, min: 1 },
    languages: [{ type: String }],
    certifications: [{ type: String }],
    bio: { type: String }
  },
  
  // Location Information
  location: {
    type: String,
    required: [true, 'Location is required'],
    enum: [
      'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano',
      'Benin City', 'Uyo', 'Calabar', 'Enugu', 'Aba', 'Nationwide'
    ]
  },
  serviceAreas: [{
    type: String,
    trim: true
  }],
  
  // Service Details
  images: [{
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    originalname: { type: String },
    mimetype: { type: String },
    size: { type: Number }
  }],
  
  // Services Included
  servicesIncluded: [{
    type: String,
    trim: true
  }],
  
  // Packages (if applicable)
  packages: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: String },
    features: [{ type: String }]
  }],
  
  // Ratings & Reviews
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,
    date: { type: Date, default: Date.now }
  }],
  reviewsCount: {
    type: Number,
    default: 0
  },
  
  // Performance Metrics
  completedJobs: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  saves: {
    type: Number,
    default: 0
  },
  
  // Experience & Features
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'professional', 'expert'],
    default: 'professional'
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Insurance & Guarantee
  insurance: {
    type: Boolean,
    default: false
  },
  guarantee: {
    type: String,
    trim: true
  },
  
  // Availability
  availability: {
    monday: { type: String, default: '9:00 AM - 6:00 PM' },
    tuesday: { type: String, default: '9:00 AM - 6:00 PM' },
    wednesday: { type: String, default: '9:00 AM - 6:00 PM' },
    thursday: { type: String, default: '9:00 AM - 6:00 PM' },
    friday: { type: String, default: '9:00 AM - 6:00 PM' },
    saturday: { type: String, default: '9:00 AM - 4:00 PM' },
    sunday: { type: String, default: 'Closed' }
  },
  
  // Contact Information
  contactInfo: {
    phone: { type: String, required: true },
    email: { type: String },
    whatsapp: { type: String }
  },
  
  // Verification & Status
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
  verifiedAt: {
    type: Date
  },
  
  // Metadata
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceId: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true
});

// Generate service ID before saving
serviceSchema.pre('save', async function() {
  if (!this.serviceId) {
    const categoryCode = this.category.substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    this.serviceId = `SV-${categoryCode}-${randomNum}`;
  }
});

// Indexes for better query performance
serviceSchema.index({ category: 1, rating: -1 });
serviceSchema.index({ location: 1, price: 1 });
serviceSchema.index({ 'provider.id': 1 });
serviceSchema.index({ featured: -1, createdAt: -1 });
serviceSchema.index({ isActive: 1, isVerified: 1 });
serviceSchema.index({ tags: 1 });

// Virtual for average rating
serviceSchema.virtual('averageRating').get(function() {
  if (this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
});

// Method to increment views
serviceSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Method to increment saves
serviceSchema.methods.incrementSaves = async function() {
  this.saves += 1;
  await this.save();
};

// Method to add a review
serviceSchema.methods.addReview = async function(userId, name, rating, comment) {
  this.reviews.push({
    user: userId,
    name,
    rating,
    comment
  });
  this.reviewsCount += 1;
  
  // Recalculate average rating
  const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
  this.rating = (totalRating / this.reviews.length).toFixed(1);
  
  await this.save();
};

// Static method for advanced search
serviceSchema.statics.search = async function(filters, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const query = { isActive: true, isVerified: true };
  
  if (filters.category && filters.category !== 'all') query.category = filters.category;
  if (filters.location && filters.location !== 'all') query.location = filters.location;
  if (filters.experienceLevel && filters.experienceLevel !== 'all') {
    query.experienceLevel = filters.experienceLevel;
  }
  if (filters.minPrice) query.price = { ...query.price, $gte: filters.minPrice };
  if (filters.maxPrice) query.price = { ...query.price, $lte: filters.maxPrice };
  if (filters.minRating) query.rating = { $gte: filters.minRating };
  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: 'i' } },
      { description: { $regex: filters.search, $options: 'i' } },
      { 'provider.name': { $regex: filters.search, $options: 'i' } },
      { tags: { $regex: filters.search, $options: 'i' } }
    ];
  }
  
  const services = await this.find(query)
    .populate('postedBy', 'firstName lastName email phone')
    .populate('provider.id', 'firstName lastName email phone profileImage')
    .sort({ featured: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);
    
  const total = await this.countDocuments(query);
  
  return {
    services,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page
  };
};

const Service = mongoose.model('Service', serviceSchema);
module.exports = Service;