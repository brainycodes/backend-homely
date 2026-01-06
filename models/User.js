const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  userType: {
    type: String,
    enum: ['agent-landlord', 'house-seeker'],
    default: 'house-seeker',
    required: true
  },
  agreeToTerms: {
    type: Boolean,
    required: [true, 'You must agree to terms and conditions'],
    default: false,
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: 'You must agree to terms and conditions'
    }
  },
  newsletter: {
    type: Boolean,
    default: true
  },
  savedProperties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  }],
  savedServices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  userType: {
    type: String,
    enum: ['buyer-renter', 'agent-landlord', 'service-provider', 'admin'],
    default: 'buyer-renter'
  },
  specialization: {
    type: String,
    trim: true
  },
  experience: {
    type: String,
    trim: true
  },
  certifications: [{
    type: String,
    trim: true
  }],
  languages: [{
    type: String,
    trim: true
  }],
  teamSize: {
    type: Number,
    min: 1,
    default: 1
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  emailVerificationSentAt: Date,
  profileImage: {
    type: String
  }
}, {
  timestamps: true
});

// FIXED: Hash password before saving (Mongoose 6+ style)
userSchema.pre('save', async function() {
  try {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
      return;
    }
    
    // Generate salt
    const salt = await bcrypt.genSalt(10);
    
    // Hash password with salt
    const hashedPassword = await bcrypt.hash(this.password, salt);
    
    // Replace plain password with hashed password
    this.password = hashedPassword;
    
  } catch (error) {
    console.error('Error hashing password:', error);
    throw error;
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Method to get user without sensitive data
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

// Static method to check if email exists
userSchema.statics.emailExists = async function(email) {
  const user = await this.findOne({ email: email.toLowerCase() });
  return !!user;
};

const User = mongoose.model('User', userSchema);
module.exports = User;