// server.js - Works everywhere without checking VERCEL env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');

const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminPropertyRoutes = require('./routes/adminPropertyRoutes');
const profileRoutes = require('./routes/profileRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const adminServiceRoutes = require('./routes/adminServiceRoutes');
const userRoutes = require('./routes/userRoutes');
const savedRoutes = require('./routes/savedRoutes');
const messageRoutes = require('./routes/messageRoutes');
const savedSearchesRoutes = require('./routes/savedSearchesRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminUsersRoutes = require('./routes/adminUsersRoutes');

const { setupWebSocket } = require('./hooks/websocket');

// Initialize express
const app = express();

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://homely-theta.vercel.app',
    process.env.CLIENT_URL || 'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========== DATABASE CONNECTION ==========
const connectDB = async () => {
  try {
    // Increase timeout and retry options
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 seconds
      socketTimeoutMS: 45000, // 45 seconds
      family: 4, // Use IPv4, skip trying IPv6
      maxPoolSize: 10,
      minPoolSize: 1,
      retryWrites: true,
      w: 'majority'
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log('✅ MongoDB Connected');
    
    // Connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connection established');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB connection disconnected');
    });
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.log('💡 Tips to fix MongoDB connection:');
    console.log('1. Check if MongoDB is running locally: `mongod` or `brew services start mongodb-community`');
    console.log('2. Check your MONGODB_URI in .env file');
    console.log('3. For local development, use: mongodb://localhost:27017/homely');
    console.log('4. Make sure MongoDB port 27017 is not blocked by firewall');
    return false;
  }
};

// ========== ROUTES ==========
// Basic routes
app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbConnected = dbStatus === 1;
  
  res.json({
    message: 'Welcome to Homely API',
    status: 'running',
    database: dbConnected ? 'connected' : 'disconnected',
    databaseStatus: dbStatus, // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', async (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    database: dbConnected ? 'connected' : 'disconnected',
    databaseStatus: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Import your actual routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-properties', adminPropertyRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/admin-services', adminServiceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin-users', adminUsersRoutes);

// ========== ERROR HANDLING ==========
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Try to connect to MongoDB
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
      console.log('⚠️ Starting server without database connection...');
      console.log('📋 Some features may not work until MongoDB is connected');
    }
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Setup WebSocket (will handle MongoDB errors gracefully)
    setupWebSocket(server);
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Access the API at: http://localhost:${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      
      if (!dbConnected) {
        console.log(`\n⚠️ IMPORTANT: MongoDB is not connected!`);
        console.log(`Please check your MongoDB connection and restart the server.`);
      }
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  // Close MongoDB connection
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  }
  
  process.exit(0);
});

startServer();