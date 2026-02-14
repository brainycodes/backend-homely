// backend/models/Blog.js
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Blog title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  excerpt: {
    type: String,
    required: [true, 'Excerpt is required'],
    trim: true,
    minlength: [10, 'Excerpt must be at least 10 characters'],
    maxlength: [300, 'Excerpt cannot exceed 300 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    minlength: [50, 'Content must be at least 50 characters']
  },
  author: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      trim: true,
      default: 'Contributor'
    },
    avatar: {
      type: String,
      default: '/api/placeholder/40/40'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Market Trends',
      'Investment',
      'Design',
      'Technology',
      'Sustainability',
      'Finance',
      'Commercial',
      'Management',
      'News',
      'Guide'
    ]
  },
  tags: [{
    type: String,
    trim: true
  }],
  image: {
    type: String,
    required: [true, 'Featured image is required']
  },
  imagePublicId: {
    type: String
  },
  featured: {
    type: Boolean,
    default: false
  },
  published: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  readTime: {
    type: String,
    default: '5 min read'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  saves: {
    type: Number,
    default: 0
  },
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    email: String,
    content: {
      type: String,
      required: true,
      trim: true
    },
    likes: {
      type: Number,
      default: 0
    },
    likedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    replies: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String,
      email: String,
      content: String,
      createdAt: {
        type: Date,
        default: Date.now
      },
      likes: {
        type: Number,
        default: 0
      },
      likedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: Date
  }],
  metaTitle: {
    type: String,
    trim: true
  },
  metaDescription: {
    type: String,
    trim: true,
    maxlength: 160
  },
  metaKeywords: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
blogSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
blogSchema.index({ category: 1, featured: -1 });
blogSchema.index({ published: 1, publishedAt: -1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ views: -1 });
blogSchema.index({ createdAt: -1 });

// Generate slug from title before saving - WITHOUT next()
blogSchema.pre('save', async function() {
  // Only generate slug if title is modified or slug doesn't exist
  if (this.isModified('title') || !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 100);
  }
  
  // Calculate read time if content is modified
  if (this.isModified('content')) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    const readTime = Math.ceil(wordCount / wordsPerMinute);
    this.readTime = `${readTime} min read`;
  }
  
  // Set publishedAt when published becomes true
  if (this.isModified('published') && this.published && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // No need to call next() - just return
});

// Method to increment views
blogSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Method to toggle like
blogSchema.methods.toggleLike = async function(userId) {
  const index = this.likedBy.indexOf(userId);
  if (index === -1) {
    this.likedBy.push(userId);
    this.likes += 1;
  } else {
    this.likedBy.splice(index, 1);
    this.likes -= 1;
  }
  await this.save();
  return this.likes;
};

// Method to toggle save
blogSchema.methods.toggleSave = async function(userId) {
  const index = this.savedBy.indexOf(userId);
  if (index === -1) {
    this.savedBy.push(userId);
    this.saves += 1;
  } else {
    this.savedBy.splice(index, 1);
    this.saves -= 1;
  }
  await this.save();
  return this.saves;
};

// Static method to get blog stats
blogSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalPosts: { $sum: 1 },
        publishedPosts: { $sum: { $cond: [{ $eq: ['$published', true] }, 1, 0] } },
        draftPosts: { $sum: { $cond: [{ $eq: ['$published', false] }, 1, 0] } },
        featuredPosts: { $sum: { $cond: [{ $eq: ['$featured', true] }, 1, 0] } },
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: '$likes' },
        totalSaves: { $sum: '$saves' },
        totalComments: { $sum: { $size: '$comments' } }
      }
    }
  ]);

  const categoryStats = await this.aggregate([
    { $match: { published: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  return {
    overview: stats[0] || {
      totalPosts: 0,
      publishedPosts: 0,
      draftPosts: 0,
      featuredPosts: 0,
      totalViews: 0,
      totalLikes: 0,
      totalSaves: 0,
      totalComments: 0
    },
    categoryStats
  };
};

const Blog = mongoose.model('Blog', blogSchema);
module.exports = Blog;