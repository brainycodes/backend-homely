const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const EmailService = require('../services/emailService');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },  // Change this line
    process.env.JWT_SECRET || 'your-fallback-secret-for-development',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      password, 
      confirmPassword,
      userType,
      agreeToTerms,
      newsletter 
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: firstName, lastName, email, password, confirmPassword'
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user agrees to terms
    if (!agreeToTerms) {
      return res.status(400).json({
        success: false,
        message: 'You must agree to the terms and conditions'
      });
    }

    // Check if email already exists
    const emailExists = await User.emailExists(email);
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please use a different email or login.'
      });
    }

    // Validate user type
    const validUserTypes = ['agent-landlord', 'house-seeker'];
    const finalUserType = userType && validUserTypes.includes(userType) ? userType : 'house-seeker';

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create new user
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password,
      userType: finalUserType,
      agreeToTerms,
      newsletter: newsletter !== undefined ? newsletter : true,
      emailVerificationToken,
      emailVerificationExpires,
      emailVerificationSentAt: new Date(),
      lastLogin: new Date()
    });

    // Generate JWT token (temporary, not fully verified)
    const token = generateToken(user._id);

    // Get user data without password
    const userData = user.toJSON();

    // Prepare verification link
    const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${emailVerificationToken}&email=${encodeURIComponent(user.email)}`;

    // Send verification email
    await EmailService.sendVerificationEmail(user, verificationLink);

    // Prepare response
    const response = {
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      token,
      user: {
        ...userData,
        emailVerified: false // Explicitly set to false
      },
      requiresVerification: true
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('Registration Error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error (email already exists)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please use a different email or login.'
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration. Please try again.'
    });
  }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification link'
      });
    }

    // Find user by email and token
    const user = await User.findOne({
      email: email.toLowerCase(),
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification link'
      });
    }

    // Update user as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Send welcome email
    await EmailService.sendWelcomeEmail(user);

    // Generate new JWT token
    const newToken = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      token: newToken,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Email Verification Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during email verification'
    });
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    user.emailVerificationSentAt = new Date();
    await user.save();

    // Prepare verification link
    const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${emailVerificationToken}&email=${encodeURIComponent(user.email)}`;

    // Send verification email
    await EmailService.sendVerificationEmail(user, verificationLink);

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully'
    });

  } catch (error) {
    console.error('Resend Verification Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resending verification email'
    });
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Update last login attempt
      user.lastLogin = new Date();
      await user.save();

      // Return specific response for unverified email
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: user.email,
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: false
        }
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Get user data without password
    const userData = user.toJSON();

    // Prepare response
    const response = {
      success: true,
      message: 'Login successful!',
      token,
      user: userData
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Login Error:', error);

    res.status(500).json({
      success: false,
      message: 'An error occurred during login. Please try again.'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private (requires token)
exports.getMe = async (req, res) => {
  try {
    // In a real app, you'd get user ID from the JWT token
    // For now, we'll return a placeholder
    res.status(200).json({
      success: true,
      message: 'User profile endpoint - will be implemented with JWT middleware'
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching profile'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = (req, res) => {
  try {
    // In a real app with token blacklisting, you'd handle it here
    // For JWT, logout is handled client-side by removing the token
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during logout'
    });
  }
};