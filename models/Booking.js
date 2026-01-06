const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    default: '2'
  },
  address: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'transfer', 'mobile'],
    default: 'cash'
  },
  review: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    date: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
bookingSchema.index({ service: 1, date: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index({ status: 1, date: 1 });

// Virtual for formatted date
bookingSchema.virtual('dateFormatted').get(function() {
  return this.date.toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;