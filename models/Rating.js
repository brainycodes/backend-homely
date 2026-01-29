const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ratedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure one rating per user per agent
ratingSchema.index({ user: 1, ratedUser: 1 }, { unique: true });

// Update agent's average rating after saving
ratingSchema.post('save', async function() {
  try {
    const Rating = mongoose.model('Rating');
    
    // Calculate average rating for the agent
    const result = await Rating.aggregate([
      { $match: { ratedUser: this.ratedUser } },
      {
        $group: {
          _id: '$ratedUser',
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 }
        }
      }
    ]);
    
    // Update the user's rating field
    const User = mongoose.model('User');
    if (result.length > 0) {
      await User.findByIdAndUpdate(this.ratedUser, {
        rating: parseFloat(result[0].averageRating.toFixed(1)),
        totalRatings: result[0].totalRatings
      });
    }
  } catch (error) {
    console.error('Error updating average rating:', error);
  }
});

// Update agent's average rating after deleting a rating
ratingSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    const Rating = mongoose.model('Rating');
    const User = mongoose.model('User');
    
    const result = await Rating.aggregate([
      { $match: { ratedUser: doc.ratedUser } },
      {
        $group: {
          _id: '$ratedUser',
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 }
        }
      }
    ]);
    
    if (result.length > 0) {
      await User.findByIdAndUpdate(doc.ratedUser, {
        rating: parseFloat(result[0].averageRating.toFixed(1)),
        totalRatings: result[0].totalRatings
      });
    } else {
      // No ratings left, set to default
      await User.findByIdAndUpdate(doc.ratedUser, {
        rating: 0,
        totalRatings: 0
      });
    }
  }
});

const Rating = mongoose.model('Rating', ratingSchema);
module.exports = Rating;