const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  searchType: {
    type: String,
    required: true,
    enum: ['property', 'service']
  },
  searchQuery: {
    type: String,
    required: true,
    trim: true
  },
  filters: {
    priceRange: [Number],
    location: String,
    propertyTypes: [String],
    serviceCategories: [String]
  },
  notificationType: {
    type: String,
    enum: ['email', 'push'],
    default: 'email'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastNotified: {
    type: Date
  },
  matchCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
savedSearchSchema.index({ email: 1, isActive: 1, createdAt: -1 });
savedSearchSchema.index({ 
  searchType: 1, 
  'filters.location': 1,
  'filters.priceRange': 1,
  isActive: 1 
});

const SavedSearch = mongoose.model('SavedSearch', savedSearchSchema);
module.exports = SavedSearch;