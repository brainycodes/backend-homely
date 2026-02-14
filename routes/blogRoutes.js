// backend/routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { protect, isAdmin } = require('../middleware/authMiddleware');
const { body } = require('express-validator');

// ==================== PUBLIC ROUTES ====================

// Get all published posts (with filters)
router.get('/posts', blogController.getPublishedPosts);

// Get single post by slug
router.get('/posts/:slug', blogController.getPostBySlug);

// ==================== AUTHENTICATED USER ROUTES ====================

// Toggle like on post (requires login)
router.post('/:id/like', protect, blogController.toggleLike);

// Toggle save post (requires login)
router.post('/:id/save', protect, blogController.toggleSave);

// Add comment to post (requires login)
router.post('/:id/comments', protect, blogController.addComment);

// ==================== ADMIN ROUTES ====================

// Get all posts (admin) - with filters
router.get('/admin/posts', protect, isAdmin, blogController.getAllPosts);

// Get single post by ID (admin)
router.get('/admin/posts/:id', protect, isAdmin, blogController.getPostById);

// Create new post (admin)
router.post('/admin/posts', 
  protect, 
  isAdmin,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('excerpt').notEmpty().withMessage('Excerpt is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('category').notEmpty().withMessage('Category is required'),
    body('image').notEmpty().withMessage('Featured image is required')
  ],
  blogController.createPost
);

// Update post (admin)
router.put('/admin/posts/:id', protect, isAdmin, blogController.updatePost);

// Delete post (admin)
router.delete('/admin/posts/:id', protect, isAdmin, blogController.deletePost);

// Toggle published status (admin)
router.patch('/admin/posts/:id/toggle-published', protect, isAdmin, blogController.togglePublished);

// Toggle featured status (admin)
router.patch('/admin/posts/:id/toggle-featured', protect, isAdmin, blogController.toggleFeatured);

// Get blog statistics (admin)
router.get('/admin/stats', protect, isAdmin, blogController.getBlogStats);

// Delete comment (admin)
router.delete('/admin/comments/:postId/:commentId', protect, isAdmin, blogController.deleteComment);

module.exports = router;