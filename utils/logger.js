const logger = {
  info: (message, data = {}) => {
    console.log(`📝 INFO: ${message}`, Object.keys(data).length ? data : '');
  },
  error: (message, error = {}) => {
    console.error(`❌ ERROR: ${message}`, error.message || error);
  },
  warn: (message, data = {}) => {
    console.warn(`⚠️ WARN: ${message}`, data);
  },
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 DEBUG: ${message}`, data);
    }
  }
};

module.exports = logger;