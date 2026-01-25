const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware.protect);

// Get user's bookings (as client)
router.get('/user', bookingController.getUserBookings);

// Get provider's bookings
router.get('/provider', bookingController.getProviderBookings);

// Get booking stats
router.get('/stats', bookingController.getBookingStats);

// Get booking details
router.get('/:bookingId', bookingController.getBookingDetails);

// Update booking status
router.patch('/:bookingId/status', bookingController.updateBookingStatus);

// Add review to booking
router.post('/:bookingId/review', bookingController.addReview);

// Delete booking
router.delete('/:bookingId', bookingController.deleteBooking);

module.exports = router;