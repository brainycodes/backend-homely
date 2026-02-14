// backend/controllers/blogController.js
const Blog = require('../models/Blog');
const cloudinary = require('../config/cloudinary');
const { validationResult } = require('express-validator');

class BlogController {
  
  // ==================== PUBLIC ROUTES ====================
  
  /**
   * Get all published blog posts (public)
   */
  async getPublishedPosts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const skip = (page - 1) * limit;
      
      const { category, tag, search, featured } = req.query;
      
      const query = { published: true };
      
      // Apply filters
      if (category && category !== 'All Topics') {
        query.category = category;
      }
      
      if (tag) {
        query.tags = tag;
      }
      
      if (featured === 'true') {
        query.featured = true;
      }
      
      if (search) {
        query.$text = { $search: search };
      }
      
      // Get total count
      const total = await Blog.countDocuments(query);
      
      // Get posts
      const posts = await Blog.find(query)
        .select('-content -likedBy -savedBy -comments')
        .sort({ featured: -1, publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Get featured posts for homepage
      const featuredPosts = await Blog.find({ published: true, featured: true })
        .select('-content -likedBy -savedBy -comments')
        .sort({ publishedAt: -1 })
        .limit(2)
        .lean();
      
      // Get popular posts (by views)
      const popularPosts = await Blog.find({ published: true })
        .select('title slug excerpt author category readTime publishedAt views')
        .sort({ views: -1 })
        .limit(5)
        .lean();
      
      // Get all categories with counts
      const categories = await Blog.aggregate([
        { $match: { published: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      // Get popular tags
      const tags = await Blog.aggregate([
        { $match: { published: true } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ]);
      
      res.json({
        success: true,
        data: {
          posts,
          featuredPosts,
          popularPosts,
          categories: categories.map(c => c._id),
          tags: tags.map(t => t._id),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
      
    } catch (error) {
      console.error('Get published posts error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching blog posts',
        error: error.message
      });
    }
  }
  
  /**
   * Get single blog post by slug (public)
   */
  async getPostBySlug(req, res) {
    try {
      const { slug } = req.params;
      
      const post = await Blog.findOne({ slug, published: true })
        .populate('comments.user', 'firstName lastName profileImage')
        .populate('comments.replies.user', 'firstName lastName profileImage')
        .lean();
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      // Increment view count
      await Blog.findByIdAndUpdate(post._id, { $inc: { views: 1 } });
      
      // Get related posts (same category or tags)
      const relatedPosts = await Blog.find({
        _id: { $ne: post._id },
        published: true,
        $or: [
          { category: post.category },
          { tags: { $in: post.tags } }
        ]
      })
        .select('title slug excerpt author category image readTime publishedAt')
        .limit(3)
        .lean();
      
      res.json({
        success: true,
        data: {
          ...post,
          views: post.views + 1
        },
        relatedPosts
      });
      
    } catch (error) {
      console.error('Get post by slug error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching blog post',
        error: error.message
      });
    }
  }
  
  /**
   * Toggle like on post (authenticated)
   */
  async toggleLike(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      const likes = await post.toggleLike(userId);
      
      res.json({
        success: true,
        message: 'Like toggled successfully',
        data: { likes }
      });
      
    } catch (error) {
      console.error('Toggle like error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling like',
        error: error.message
      });
    }
  }
  
  /**
   * Toggle save post (authenticated)
   */
  async toggleSave(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      const saves = await post.toggleSave(userId);
      
      res.json({
        success: true,
        message: 'Save toggled successfully',
        data: { saves }
      });
      
    } catch (error) {
      console.error('Toggle save error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling save',
        error: error.message
      });
    }
  }
  
  /**
   * Add comment to post
   */
  async addComment(req, res) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user.id;
      
      if (!content || content.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Comment content is required'
        });
      }
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      const comment = {
        user: userId,
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        content: content.trim(),
        createdAt: new Date()
      };
      
      post.comments.push(comment);
      await post.save();
      
      res.json({
        success: true,
        message: 'Comment added successfully',
        data: comment
      });
      
    } catch (error) {
      console.error('Add comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding comment',
        error: error.message
      });
    }
  }
  
  // ==================== ADMIN ROUTES ====================
  
  /**
   * Get all blog posts (admin)
   */
  async getAllPosts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;
      
      const { search, category, status, featured } = req.query;
      
      const query = {};
      
      // Apply filters
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (category && category !== 'all') {
        query.category = category;
      }
      
      if (status === 'published') {
        query.published = true;
      } else if (status === 'draft') {
        query.published = false;
      }
      
      if (featured === 'true') {
        query.featured = true;
      } else if (featured === 'false') {
        query.featured = false;
      }
      
      const total = await Blog.countDocuments(query);
      
      const posts = await Blog.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Get stats
      const stats = await Blog.getStats();
      
      res.json({
        success: true,
        data: posts,
        stats: stats.overview,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      console.error('Get all posts error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching blog posts',
        error: error.message
      });
    }
  }
  
  /**
   * Get single blog post by ID (admin)
   */
  async getPostById(req, res) {
    try {
      const { id } = req.params;
      
      const post = await Blog.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .populate('comments.user', 'firstName lastName email profileImage')
        .populate('comments.replies.user', 'firstName lastName email profileImage')
        .lean();
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      res.json({
        success: true,
        data: post
      });
      
    } catch (error) {
      console.error('Get post by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching blog post',
        error: error.message
      });
    }
  }
  
  /**
   * Create new blog post (admin)
   */
  async createPost(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const {
        title,
        excerpt,
        content,
        category,
        tags,
        image,
        imagePublicId,
        featured,
        published,
        metaTitle,
        metaDescription,
        metaKeywords,
        authorName,
        authorRole
      } = req.body;
      
      // Check if slug already exists
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);
      
      const existingPost = await Blog.findOne({ slug });
      if (existingPost) {
        return res.status(400).json({
          success: false,
          message: 'A post with this title already exists'
        });
      }
      
      // Parse tags if sent as string
      let parsedTags = tags;
      if (typeof tags === 'string') {
        parsedTags = tags.split(',').map(t => t.trim());
      }
      
      // Parse meta keywords
      let parsedMetaKeywords = metaKeywords;
      if (typeof metaKeywords === 'string') {
        parsedMetaKeywords = metaKeywords.split(',').map(k => k.trim());
      }
      
      const postData = {
        title: title.trim(),
        slug,
        excerpt: excerpt.trim(),
        content,
        category,
        tags: parsedTags || [],
        image,
        imagePublicId,
        featured: featured || false,
        published: published || false,
        metaTitle: metaTitle || title,
        metaDescription: metaDescription || excerpt,
        metaKeywords: parsedMetaKeywords || [],
        author: {
          name: authorName || `${req.user.firstName} ${req.user.lastName}`,
          role: authorRole || 'Admin',
          avatar: req.user.profileImage || '/api/placeholder/40/40',
          userId: req.user.id
        },
        createdBy: req.user.id
      };
      
      const post = await Blog.create(postData);
      
      res.status(201).json({
        success: true,
        message: 'Blog post created successfully',
        data: post
      });
      
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating blog post',
        error: error.message
      });
    }
  }
  
  /**
   * Update blog post (admin)
   */
  async updatePost(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      // Handle slug update if title changed
      if (updates.title && updates.title !== post.title) {
        updates.slug = updates.title
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 100);
        
        // Check if new slug already exists (excluding current post)
        const existingPost = await Blog.findOne({ 
          slug: updates.slug,
          _id: { $ne: id }
        });
        
        if (existingPost) {
          return res.status(400).json({
            success: false,
            message: 'A post with this title already exists'
          });
        }
      }
      
      // Parse tags if sent as string
      if (updates.tags && typeof updates.tags === 'string') {
        updates.tags = updates.tags.split(',').map(t => t.trim());
      }
      
      // Parse meta keywords
      if (updates.metaKeywords && typeof updates.metaKeywords === 'string') {
        updates.metaKeywords = updates.metaKeywords.split(',').map(k => k.trim());
      }
      
      // Handle author update
      if (updates.authorName || updates.authorRole) {
        updates.author = {
          ...post.author,
          ...(updates.authorName && { name: updates.authorName }),
          ...(updates.authorRole && { role: updates.authorRole })
        };
        delete updates.authorName;
        delete updates.authorRole;
      }
      
      updates.updatedBy = req.user.id;
      
      const updatedPost = await Blog.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      ).populate('createdBy', 'firstName lastName email')
       .populate('updatedBy', 'firstName lastName email');
      
      res.json({
        success: true,
        message: 'Blog post updated successfully',
        data: updatedPost
      });
      
    } catch (error) {
      console.error('Update post error:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', ')
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating blog post',
        error: error.message
      });
    }
  }
  
  /**
   * Delete blog post (admin)
   */
  async deletePost(req, res) {
    try {
      const { id } = req.params;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      // Delete image from Cloudinary if exists
      if (post.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(post.imagePublicId);
        } catch (cloudinaryError) {
          console.error('Cloudinary deletion error:', cloudinaryError);
        }
      }
      
      await Blog.findByIdAndDelete(id);
      
      res.json({
        success: true,
        message: 'Blog post deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete post error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting blog post',
        error: error.message
      });
    }
  }
  
  /**
   * Toggle post published status
   */
  async togglePublished(req, res) {
    try {
      const { id } = req.params;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      post.published = !post.published;
      
      if (post.published && !post.publishedAt) {
        post.publishedAt = new Date();
      }
      
      post.updatedBy = req.user.id;
      await post.save();
      
      res.json({
        success: true,
        message: `Post ${post.published ? 'published' : 'unpublished'} successfully`,
        data: {
          id: post._id,
          published: post.published,
          publishedAt: post.publishedAt
        }
      });
      
    } catch (error) {
      console.error('Toggle published error:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling published status',
        error: error.message
      });
    }
  }
  
  /**
   * Toggle post featured status
   */
  async toggleFeatured(req, res) {
    try {
      const { id } = req.params;
      
      const post = await Blog.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      post.featured = !post.featured;
      post.updatedBy = req.user.id;
      await post.save();
      
      res.json({
        success: true,
        message: `Post ${post.featured ? 'featured' : 'unfeatured'} successfully`,
        data: {
          id: post._id,
          featured: post.featured
        }
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
  
  /**
   * Get blog statistics (admin)
   */
  async getBlogStats(req, res) {
    try {
      const stats = await Blog.getStats();
      
      // Get monthly post counts
      const monthlyPosts = await Blog.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]);
      
      // Get top posts by views
      const topPosts = await Blog.find({ published: true })
        .select('title slug views likes comments')
        .sort({ views: -1 })
        .limit(5)
        .lean();
      
      res.json({
        success: true,
        data: {
          overview: stats.overview,
          categories: stats.categoryStats,
          monthlyPosts,
          topPosts
        }
      });
      
    } catch (error) {
      console.error('Get blog stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching blog statistics',
        error: error.message
      });
    }
  }
  
  /**
   * Delete comment (admin)
   */
  async deleteComment(req, res) {
    try {
      const { postId, commentId } = req.params;
      
      const post = await Blog.findById(postId);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }
      
      const commentIndex = post.comments.findIndex(
        c => c._id.toString() === commentId
      );
      
      if (commentIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }
      
      post.comments.splice(commentIndex, 1);
      await post.save();
      
      res.json({
        success: true,
        message: 'Comment deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting comment',
        error: error.message
      });
    }
  }
}

module.exports = new BlogController();