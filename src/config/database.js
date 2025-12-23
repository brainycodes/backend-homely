// src/config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('🔗 Attempting MongoDB connection...');
    console.log('URI present:', !!process.env.MONGODB_URI);
    
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI is not set in environment variables');
      throw new Error('MongoDB connection string is missing');
    }
    
    // Connection options
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    return conn;
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // Don't exit process on Vercel - just log error
    if (process.env.VERCEL) {
      console.log('⚠️ Running without database connection on Vercel');
      return null;
    } else {
      // Exit locally
      process.exit(1);
    }
  }
};

// Connection events
mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error(`📊 Mongoose connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('📊 Mongoose disconnected from DB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📊 MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;