// api/index.js - This is the Vercel serverless entry point
require('dotenv').config();
const app = require('./src/app');

// Export as a serverless function
module.exports = (req, res) => {
  return app(req, res);
};