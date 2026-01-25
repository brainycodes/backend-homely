const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const moment = require('moment');

class BookingController {
  // Get user's bookings (as a client)
  async getUserBookings(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const status = req.query.status;
      const skip = (page - 1) * limit;
      
      const query = { user: req.user.id };
      
      if (status && status !== 'all') {
        query.status = status;
      }
      
      // Get bookings with populated data
      const bookings = await Booking.find(query)
        .populate('service', 'title category price pricingType images provider')
        .populate('provider', 'firstName lastName email phone profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format bookings
      const formattedBookings = bookings.map(booking => {
        const bookingObj = {
          ...booking,
          dateFormatted: moment(booking.date).format('MMMM Do, YYYY'),
          createdAtFormatted: moment(booking.createdAt).fromNow(),
          totalPriceFormatted: new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN'
          }).format(booking.totalPrice)
        };
        
        return bookingObj;
      });
      
      const total = await Booking.countDocuments(query);
      
      res.status(200).json({
        success: true,
        bookings: formattedBookings,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get user bookings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching bookings',
        error: error.message
      });
    }
  }
  
  // Get provider's bookings (as a service provider)
  async getProviderBookings(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const status = req.query.status;
      const skip = (page - 1) * limit;
      
      const query = { provider: req.user.id };
      
      if (status && status !== 'all') {
        query.status = status;
      }
      
      // Get bookings with populated data
      const bookings = await Booking.find(query)
        .populate('service', 'title category price pricingType images')
        .populate('user', 'firstName lastName email phone profileImage')
        .sort({ date: 1, time: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format bookings
      const formattedBookings = bookings.map(booking => {
        const bookingObj = {
          ...booking,
          dateFormatted: moment(booking.date).format('MMMM Do, YYYY'),
          timeFormatted: booking.time,
          createdAtFormatted: moment(booking.createdAt).fromNow(),
          totalPriceFormatted: new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN'
          }).format(booking.totalPrice),
          upcoming: moment(booking.date).isAfter(new Date())
        };
        
        return bookingObj;
      });
      
      const total = await Booking.countDocuments(query);
      
      res.status(200).json({
        success: true,
        bookings: formattedBookings,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      });
      
    } catch (error) {
      console.error('Get provider bookings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching provider bookings',
        error: error.message
      });
    }
  }
  
  // Get booking stats
  async getBookingStats(req, res) {
    try {
      const userId = req.user.id;
      
      // Get stats for both as client and provider
      const clientStats = await Booking.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' }
          }
        }
      ]);
      
      const providerStats = await Booking.aggregate([
        { $match: { provider: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' }
          }
        }
      ]);
      
      // Calculate totals
      const clientTotal = await Booking.countDocuments({ user: userId });
      const providerTotal = await Booking.countDocuments({ provider: userId });
      
      // Get upcoming bookings
      const upcomingBookings = await Booking.countDocuments({
        provider: userId,
        status: { $in: ['pending', 'confirmed'] },
        date: { $gte: new Date() }
      });
      
      // Get completed bookings this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const completedThisMonth = await Booking.countDocuments({
        provider: userId,
        status: 'completed',
        updatedAt: { $gte: startOfMonth }
      });
      
      res.status(200).json({
        success: true,
        stats: {
          client: {
            total: clientTotal,
            byStatus: clientStats.reduce((acc, stat) => {
              acc[stat._id] = stat.count;
              return acc;
            }, {})
          },
          provider: {
            total: providerTotal,
            byStatus: providerStats.reduce((acc, stat) => {
              acc[stat._id] = stat.count;
              return acc;
            }, {}),
            upcoming: upcomingBookings,
            completedThisMonth
          }
        }
      });
      
    } catch (error) {
      console.error('Get booking stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booking stats',
        error: error.message
      });
    }
  }
  
  // Update booking status
  async updateBookingStatus(req, res) {
    try {
      const { bookingId } = req.params;
      const { status } = req.body;
      
      const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if user is authorized (either client or provider)
      if (booking.user.toString() !== req.user.id && 
          booking.provider.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this booking'
        });
      }
      
      // Check if user is client trying to cancel
      if (booking.user.toString() === req.user.id && 
          status === 'cancelled' &&
          booking.status !== 'completed' &&
          booking.status !== 'rejected') {
        booking.status = 'cancelled';
        await booking.save();
        
        return res.status(200).json({
          success: true,
          message: 'Booking cancelled successfully'
        });
      }
      
      // Check if user is provider
      if (booking.provider.toString() === req.user.id) {
        // Provider can confirm, complete, or reject
        if (['confirmed', 'completed', 'rejected'].includes(status)) {
          booking.status = status;
          
          // If completed, update service completed jobs
          if (status === 'completed') {
            await Service.findByIdAndUpdate(
              booking.service,
              { $inc: { completedJobs: 1 } }
            );
          }
          
          await booking.save();
          
          return res.status(200).json({
            success: true,
            message: `Booking ${status} successfully`
          });
        }
      }
      
      return res.status(403).json({
        success: false,
        message: 'Not authorized for this action'
      });
      
    } catch (error) {
      console.error('Update booking status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating booking status',
        error: error.message
      });
    }
  }
  
  // Add review to booking
  async addReview(req, res) {
    try {
      const { bookingId } = req.params;
      const { rating, comment } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if user is authorized (must be the client)
      if (booking.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to review this booking'
        });
      }
      
      // Check if booking is completed
      if (booking.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Only completed bookings can be reviewed'
        });
      }
      
      // Check if already reviewed
      if (booking.review && booking.review.rating) {
        return res.status(400).json({
          success: false,
          message: 'This booking has already been reviewed'
        });
      }
      
      // Add review to booking
      booking.review = {
        rating,
        comment,
        date: new Date()
      };
      
      await booking.save();
      
      // Update service rating
      await Service.findByIdAndUpdate(
        booking.service,
        {
          $push: {
            reviews: {
              user: req.user.id,
              rating,
              comment
            }
          },
          $inc: { reviewsCount: 1 }
        }
      );
      
      res.status(200).json({
        success: true,
        message: 'Review added successfully',
        review: booking.review
      });
      
    } catch (error) {
      console.error('Add review error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding review',
        error: error.message
      });
    }
  }
  
  // Get booking details
  async getBookingDetails(req, res) {
    try {
      const { bookingId } = req.params;
      
      const booking = await Booking.findById(bookingId)
        .populate('service', 'title category price pricingType images provider description')
        .populate('user', 'firstName lastName email phone profileImage')
        .populate('provider', 'firstName lastName email phone profileImage')
        .lean();
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if user is authorized
      if (booking.user._id.toString() !== req.user.id && 
          booking.provider._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this booking'
        });
      }
      
      // Format booking
      booking.dateFormatted = moment(booking.date).format('MMMM Do, YYYY');
      booking.timeFormatted = booking.time;
      booking.createdAtFormatted = moment(booking.createdAt).format('MMMM Do, YYYY h:mm A');
      booking.totalPriceFormatted = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN'
      }).format(booking.totalPrice);
      
      res.status(200).json({
        success: true,
        booking
      });
      
    } catch (error) {
      console.error('Get booking details error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booking details',
        error: error.message
      });
    }
  }
  
  // Delete booking (only pending bookings can be deleted)
  async deleteBooking(req, res) {
    try {
      const { bookingId } = req.params;
      
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if user is authorized (must be the client)
      if (booking.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this booking'
        });
      }
      
      // Only pending bookings can be deleted
      if (booking.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending bookings can be deleted'
        });
      }
      
      await Booking.findByIdAndDelete(bookingId);
      
      res.status(200).json({
        success: true,
        message: 'Booking deleted successfully'
      });
      
    } catch (error) {
      console.error('Delete booking error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting booking',
        error: error.message
      });
    }
  }
}

module.exports = new BookingController();