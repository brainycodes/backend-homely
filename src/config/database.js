const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // For Mongoose 6+, these options are no longer needed
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error(`📊 Mongoose connection error: ${err}`);
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