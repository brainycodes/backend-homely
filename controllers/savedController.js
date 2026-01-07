const Saved = require('../models/Saved');
const Property = require('../models/Property');
const Service = require('../models/Service');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class SavedController {
  // Save an item (property or service)
  async saveItem(req, res) {
    try {
      const { itemType, itemId, notes, tags } = req.body;
      const userId = req.user.id;

      // Validate item type
      if (!['property', 'service'].includes(itemType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type. Must be "property" or "service"'
        });
      }

      // Check if item exists
      let item;
      if (itemType === 'property') {
        item = await Property.findById(itemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: 'Property not found'
          });
        }
      } else {
        item = await Service.findById(itemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: 'Service not found'
          });
        }
      }

      // Check if already saved
      const existingSave = await Saved.findOne({
        user: userId,
        itemType,
        [itemType]: itemId
      });

      if (existingSave) {
        return res.status(400).json({
          success: false,
          message: 'Item is already saved'
        });
      }

      // Create saved item
      const savedData = {
        user: userId,
        itemType,
        [itemType]: itemId,
        notes: notes || '',
        tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : []
      };

      const savedItem = new Saved(savedData);
      await savedItem.save();

      // Increment saves count on the item
      if (itemType === 'property') {
        await Property.findByIdAndUpdate(itemId, { $inc: { saves: 1 } });
      } else {
        await Service.findByIdAndUpdate(itemId, { $inc: { saves: 1 } });
      }

      res.status(201).json({
        success: true,
        message: 'Item saved successfully',
        savedItem: {
          id: savedItem._id,
          itemType,
          itemId,
          savedAt: savedItem.savedAt
        }
      });

    } catch (error) {
      console.error('Save item error:', error);
      
      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Item is already saved'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error saving item',
        error: error.message
      });
    }
  }

  // Remove saved item
  async removeSavedItem(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const savedItem = await Saved.findById(id);

      if (!savedItem) {
        return res.status(404).json({
          success: false,
          message: 'Saved item not found'
        });
      }

      // Check if user owns the saved item
      if (savedItem.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to remove this item'
        });
      }

      // Decrement saves count on the item
      if (savedItem.itemType === 'property' && savedItem.property) {
        await Property.findByIdAndUpdate(savedItem.property, { $inc: { saves: -1 } });
      } else if (savedItem.itemType === 'service' && savedItem.service) {
        await Service.findByIdAndUpdate(savedItem.service, { $inc: { saves: -1 } });
      }

      await Saved.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'Item removed from saved'
      });

    } catch (error) {
      console.error('Remove saved item error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing saved item',
        error: error.message
      });
    }
  }

  // Get all saved items for user
  async getSavedItems(req, res) {
    try {
      const userId = req.user.id;
      const { 
        itemType = 'all',
        page = 1,
        limit = 20,
        sortBy = 'savedAt',
        sortOrder = -1
      } = req.query;

      const options = {
        itemType,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder: parseInt(sortOrder)
      };

      const result = await Saved.getUserSavedItems(userId, options);

      res.status(200).json({
        success: true,
        items: result.items,
        total: result.total,
        pages: result.pages,
        currentPage: result.currentPage
      });

    } catch (error) {
      console.error('Get saved items error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching saved items',
        error: error.message
      });
    }
  }

  // Check if an item is saved
  async checkIfSaved(req, res) {
    try {
      const { itemType, itemId } = req.params;
      const userId = req.user.id;

      if (!['property', 'service'].includes(itemType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type'
        });
      }

      const savedItem = await Saved.findOne({
        user: userId,
        itemType,
        [itemType]: itemId
      });

      res.status(200).json({
        success: true,
        isSaved: !!savedItem,
        savedItem: savedItem ? {
          id: savedItem._id,
          savedAt: savedItem.savedAt,
          notes: savedItem.notes,
          tags: savedItem.tags
        } : null
      });

    } catch (error) {
      console.error('Check if saved error:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking saved status',
        error: error.message
      });
    }
  }

  // Update saved item (notes/tags)
  async updateSavedItem(req, res) {
    try {
      const { id } = req.params;
      const { notes, tags } = req.body;
      const userId = req.user.id;

      const savedItem = await Saved.findById(id);

      if (!savedItem) {
        return res.status(404).json({
          success: false,
          message: 'Saved item not found'
        });
      }

      // Check if user owns the saved item
      if (savedItem.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this item'
        });
      }

      const updateData = {};
      if (notes !== undefined) updateData.notes = notes;
      if (tags !== undefined) {
        updateData.tags = Array.isArray(tags) 
          ? tags 
          : tags.split(',').map(tag => tag.trim());
      }

      const updatedItem = await Saved.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: 'Saved item updated successfully',
        savedItem: updatedItem
      });

    } catch (error) {
      console.error('Update saved item error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating saved item',
        error: error.message
      });
    }
  }

  // Clear all saved items
  async clearAllSavedItems(req, res) {
    try {
      const userId = req.user.id;

      // Get all saved items before deleting to update saves count
      const savedItems = await Saved.find({ user: userId });

      // Update saves count for each item
      const updatePromises = savedItems.map(async (savedItem) => {
        if (savedItem.itemType === 'property' && savedItem.property) {
          await Property.findByIdAndUpdate(savedItem.property, { $inc: { saves: -1 } });
        } else if (savedItem.itemType === 'service' && savedItem.service) {
          await Service.findByIdAndUpdate(savedItem.service, { $inc: { saves: -1 } });
        }
      });

      await Promise.all(updatePromises);

      // Delete all saved items for user
      const result = await Saved.deleteMany({ user: userId });

      res.status(200).json({
        success: true,
        message: `All saved items (${result.deletedCount}) have been removed`,
        deletedCount: result.deletedCount
      });

    } catch (error) {
      console.error('Clear all saved items error:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing saved items',
        error: error.message
      });
    }
  }

  // Get saved items by type
    async getSavedItemsByType(req, res) {
    try {
        const userId = req.user.id;
        const { itemType } = req.params;
        const { 
        page = 1,
        limit = 20,
        sortBy = 'savedAt',
        sortOrder = -1
        } = req.query;

        console.log('Received request for itemType:', itemType); // Add logging

        // Fix the validation - "services" should be "service"
        const validItemTypes = ['properties', 'services', 'property', 'service'];
        if (!validItemTypes.includes(itemType)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid item type. Must be "properties", "services", "property", or "service"'
        });
        }

        // Convert plural to singular if needed
        let normalizedItemType = itemType;
        if (itemType === 'properties') normalizedItemType = 'property';
        if (itemType === 'services') normalizedItemType = 'service';

        const options = {
        itemType: normalizedItemType,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder: parseInt(sortOrder)
        };

        const result = await Saved.getUserSavedItems(userId, options);

        res.status(200).json({
        success: true,
        items: result.items,
        total: result.total,
        pages: result.pages,
        currentPage: result.currentPage,
        itemType: normalizedItemType
        });

    } catch (error) {
        console.error('Get saved items by type error:', error);
        res.status(500).json({
        success: false,
        message: 'Error fetching saved items',
        error: error.message
        });
    }
    }

  // Get saved item count
  async getSavedItemCount(req, res) {
    try {
      const userId = req.user.id;
      const { itemType } = req.query;

      const query = { user: userId };
      if (itemType && itemType !== 'all') {
        query.itemType = itemType;
      }

      const count = await Saved.countDocuments(query);

      // Get counts by type
      const propertyCount = await Saved.countDocuments({ 
        user: userId, 
        itemType: 'property' 
      });
      
      const serviceCount = await Saved.countDocuments({ 
        user: userId, 
        itemType: 'service' 
      });

      res.status(200).json({
        success: true,
        total: count,
        byType: {
          properties: propertyCount,
          services: serviceCount,
          all: count
        }
      });

    } catch (error) {
      console.error('Get saved item count error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching saved item count',
        error: error.message
      });
    }
  }

  // Search saved items
  async searchSavedItems(req, res) {
    try {
      const userId = req.user.id;
      const { 
        search,
        itemType = 'all',
        tags,
        page = 1,
        limit = 20
      } = req.query;

      const skip = (page - 1) * limit;
      const query = { user: userId };

      if (itemType && itemType !== 'all') {
        query.itemType = itemType;
      }

      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : tags.split(',');
        query.tags = { $all: tagArray };
      }

      // First get saved items
      const savedItems = await Saved.find(query)
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
        .sort({ savedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Filter by search term if provided
      let filteredItems = savedItems;
      if (search) {
        filteredItems = savedItems.filter(item => {
          if (item.itemType === 'property' && item.property) {
            return (
              item.property.title?.toLowerCase().includes(search.toLowerCase()) ||
              item.property.description?.toLowerCase().includes(search.toLowerCase()) ||
              item.property.location?.toLowerCase().includes(search.toLowerCase()) ||
              item.notes?.toLowerCase().includes(search.toLowerCase())
            );
          } else if (item.itemType === 'service' && item.service) {
            return (
              item.service.title?.toLowerCase().includes(search.toLowerCase()) ||
              item.service.description?.toLowerCase().includes(search.toLowerCase()) ||
              item.service.category?.toLowerCase().includes(search.toLowerCase()) ||
              item.service.location?.toLowerCase().includes(search.toLowerCase()) ||
              item.notes?.toLowerCase().includes(search.toLowerCase())
            );
          }
          return false;
        });
      }

      // Process items
      const processedItems = filteredItems.map(item => {
        if (item.itemType === 'property' && item.property) {
          return {
            id: item._id,
            type: 'property',
            _id: item.property._id,
            title: item.property.title,
            price: item.property.price,
            location: item.property.location,
            address: item.property.address,
            propertyType: item.property.type,
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
            } : null),
            savedAt: item.savedAt,
            notes: item.notes,
            tags: item.tags
          };
        } else if (item.itemType === 'service' && item.service) {
          return {
            id: item._id,
            type: 'service',
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
            experience: item.service.experienceLevel,
            insurance: item.service.insurance,
            images: item.service.images,
            provider: {
              name: item.service.provider?.name || `${item.service.postedBy?.firstName} ${item.service.postedBy?.lastName}`,
              avatar: item.service.provider?.avatar || item.service.postedBy?.profileImage,
              specialization: item.service.provider?.specialization
            },
            savedAt: item.savedAt,
            notes: item.notes,
            tags: item.tags
          };
        }
        return null;
      }).filter(item => item !== null);

      res.status(200).json({
        success: true,
        items: processedItems,
        total: processedItems.length,
        pages: Math.ceil(processedItems.length / limit),
        currentPage: parseInt(page)
      });

    } catch (error) {
      console.error('Search saved items error:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching saved items',
        error: error.message
      });
    }
  }
}

module.exports = new SavedController();