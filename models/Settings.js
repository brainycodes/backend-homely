// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  site: {
    siteName: { type: String, default: 'Homely' },
    siteUrl: { type: String, default: 'https://homely.ng' },
    siteDescription: { type: String, default: 'Find your dream home in Nigeria' },
    supportEmail: { type: String, default: 'support@homely.ng' },
    supportPhone: { type: String, default: '+2348000000000' },
    address: { type: String, default: 'Lagos, Nigeria' },
    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      youtube: { type: String, default: '' }
    },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    metaKeywords: [{ type: String }],
    favicon: { type: String, default: '' },
    logo: { type: String, default: '' }
  },
  email: {
    smtpHost: { type: String, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 587 },
    smtpUser: { type: String, default: '' },
    smtpPass: { type: String, default: '' },
    smtpSecure: { type: Boolean, default: true },
    fromEmail: { type: String, default: 'noreply@homely.ng' },
    fromName: { type: String, default: 'Homely' },
    emailTemplates: {
      welcome: { type: Boolean, default: true },
      passwordReset: { type: Boolean, default: true },
      reportAcknowledged: { type: Boolean, default: true },
      reportResolved: { type: Boolean, default: true },
      propertyInquiry: { type: Boolean, default: true },
      serviceBooking: { type: Boolean, default: true },
      reviewNotification: { type: Boolean, default: true },
      newsletter: { type: Boolean, default: false }
    }
  },
  security: {
    twoFactorAuth: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 30 },
    maxLoginAttempts: { type: Number, default: 5 },
    passwordMinLength: { type: Number, default: 8 },
    requireSpecialChar: { type: Boolean, default: true },
    requireNumber: { type: Boolean, default: true },
    requireUppercase: { type: Boolean, default: true },
    ipWhitelist: [{ type: String }],
    allowedDomains: [{ type: String }],
    recaptchaEnabled: { type: Boolean, default: false },
    recaptchaSiteKey: { type: String, default: '' },
    recaptchaSecretKey: { type: String, default: '' }
  },
  notifications: {
    emailNotifications: {
      newUserRegistration: { type: Boolean, default: true },
      newPropertyListing: { type: Boolean, default: true },
      newServiceListing: { type: Boolean, default: true },
      newReport: { type: Boolean, default: true },
      userSuspended: { type: Boolean, default: true },
      contentRemoved: { type: Boolean, default: true },
      dailyDigest: { type: Boolean, default: false },
      weeklyReport: { type: Boolean, default: true }
    },
    pushNotifications: {
      enabled: { type: Boolean, default: false },
      newMessages: { type: Boolean, default: true },
      newReviews: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true }
    },
    notificationChannels: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    }
  },
  payment: {
    currency: { type: String, default: 'NGN' },
    currencySymbol: { type: String, default: '₦' },
    taxRate: { type: Number, default: 7.5 },
    commissionRate: { type: Number, default: 5 },
    featuredListingFee: { type: Number, default: 5000 },
    minimumWithdrawal: { type: Number, default: 10000 },
    paymentGateways: {
      paystack: {
        enabled: { type: Boolean, default: true },
        publicKey: { type: String, default: '' },
        secretKey: { type: String, default: '' }
      },
      flutterwave: {
        enabled: { type: Boolean, default: false },
        publicKey: { type: String, default: '' },
        secretKey: { type: String, default: '' }
      },
      stripe: {
        enabled: { type: Boolean, default: false },
        publicKey: { type: String, default: '' },
        secretKey: { type: String, default: '' }
      },
      bankTransfer: {
        enabled: { type: Boolean, default: true },
        bankName: { type: String, default: 'First Bank' },
        accountName: { type: String, default: 'Homely Nigeria Ltd' },
        accountNumber: { type: String, default: '1234567890' },
        sortCode: { type: String, default: '011' }
      }
    }
  },
  listing: {
    autoApproveProperties: { type: Boolean, default: false },
    autoApproveServices: { type: Boolean, default: false },
    requireVerification: { type: Boolean, default: true },
    maxImagesPerProperty: { type: Number, default: 10 },
    maxImagesPerService: { type: Number, default: 8 },
    featuredListingDuration: { type: Number, default: 30 },
    listingExpiryDays: { type: Number, default: 90 },
    allowPriceNegotiation: { type: Boolean, default: true },
    allowVirtualTours: { type: Boolean, default: true },
    moderationKeywords: [{ type: String }],
    bannedWords: [{ type: String }],
    categories: {
      properties: [{ type: String }],
      services: [{ type: String }]
    }
  },
  seo: {
    googleAnalyticsId: { type: String, default: '' },
    googleTagManagerId: { type: String, default: '' },
    googleSearchConsole: { type: String, default: '' },
    facebookPixelId: { type: String, default: '' },
    robotsTxt: { type: String, default: 'User-agent: *\nAllow: /' },
    sitemapEnabled: { type: Boolean, default: true },
    canonicalUrl: { type: String, default: 'https://homely.ng' },
    structuredData: { type: Boolean, default: true },
    ogImage: { type: String, default: '' },
    twitterCard: { type: String, default: 'summary_large_image', enum: ['summary', 'summary_large_image', 'app', 'player'] }
  },
  maintenance: {
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'Site is under maintenance. Please check back later.' },
    allowedIps: [{ type: String }],
    backupFrequency: { type: String, default: 'weekly', enum: ['daily', 'weekly', 'monthly', 'never'] },
    backupRetention: { type: Number, default: 30 },
    logRetention: { type: Number, default: 90 },
    debugMode: { type: Boolean, default: false },
    apiRateLimit: { type: Number, default: 100 }
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;