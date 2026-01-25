const express = require('express');
const router = express.Router();
const SavedSearch = require('../models/SavedSearch');
const { check } = require('express-validator');

const saveSearchValidation = [
  check('email', 'Email is required').notEmpty().isEmail(),
  check('searchType', 'Search type is required').notEmpty().isIn(['property', 'service']),
  check('searchQuery', 'Search query is required').notEmpty(),
  check('filters', 'Filters are required').notEmpty()
];

// Save a search
router.post('/', saveSearchValidation, async (req, res) => {
  try {
    const { email, searchType, searchQuery, filters, notificationType = 'email' } = req.body;

    // Check if similar search already exists for this email
    const existingSearch = await SavedSearch.findOne({
      email,
      searchType,
      searchQuery,
      'filters.location': filters.location,
      'filters.priceRange': filters.priceRange,
      isActive: true
    });

    if (existingSearch) {
      return res.status(200).json({
        success: true,
        message: 'Search already saved',
        searchId: existingSearch._id
      });
    }

    const savedSearch = new SavedSearch({
      email,
      searchType,
      searchQuery,
      filters,
      notificationType,
      isActive: true,
      lastNotified: null
    });

    await savedSearch.save();

    res.status(201).json({
      success: true,
      message: 'Search saved successfully',
      searchId: savedSearch._id
    });
  } catch (error) {
    console.error('Save search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving search',
      error: error.message
    });
  }
});

// Get user's saved searches
router.get('/:email', async (req, res) => {
  try {
    const searches = await SavedSearch.find({
      email: req.params.email,
      isActive: true
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      searches
    });
  } catch (error) {
    console.error('Get saved searches error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching saved searches',
      error: error.message
    });
  }
});

// Delete a saved search
router.delete('/:id', async (req, res) => {
  try {
    const search = await SavedSearch.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!search) {
      return res.status(404).json({
        success: false,
        message: 'Saved search not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Search removed successfully'
    });
  } catch (error) {
    console.error('Delete saved search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing saved search',
      error: error.message
    });
  }
});

module.exports = router;