const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
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
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'moderator'],
    default: 'admin'
  },
  permissions: {
    manageUsers: {
      type: Boolean,
      default: false
    },
    manageProperties: {
      type: Boolean,
      default: false
    },
    manageServices: {
      type: Boolean,
      default: false
    },
    viewAnalytics: {
      type: Boolean,
      default: false
    },
    manageContent: {
      type: Boolean,
      default: false
    },
    systemSettings: {
      type: Boolean,
      default: false
    }
  },
  userType: {
    type: String,
    default: 'admin',
    immutable: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// FIXED: Mongoose 6+ style - no next parameter
adminSchema.pre('save', async function() {
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

// Method to compare passwords
adminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Method to get user without sensitive data
adminSchema.methods.toJSON = function() {
  const admin = this.toObject();
  delete admin.password;
  delete admin.__v;
  return admin;
};

// Static method to check if email exists
adminSchema.statics.emailExists = async function(email) {
  const admin = await this.findOne({ email: email.toLowerCase() });
  return !!admin;
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;