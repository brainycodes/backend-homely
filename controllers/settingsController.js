// controllers/settingsController.js
const Settings = require('../models/Settings'); // You'll need to create this model

class SettingsController {
  /**
   * Get all settings
   */
  async getSettings(req, res) {
    try {
      // Get settings from database or use defaults
      let settings = await Settings.findOne();
      
      if (!settings) {
        // Return default settings if none exist
        settings = {
          site: {
            siteName: 'Homely',
            siteUrl: 'https://homely.ng',
            siteDescription: 'Find your dream home in Nigeria',
            supportEmail: 'support@homely.ng',
            supportPhone: '+2348000000000',
            address: 'Lagos, Nigeria',
            socialLinks: {
              facebook: '',
              twitter: '',
              instagram: '',
              linkedin: '',
              youtube: ''
            },
            metaTitle: 'Homely - Nigeria\'s Premier Real Estate Platform',
            metaDescription: 'Find properties for sale and rent in Nigeria',
            metaKeywords: ['real estate', 'nigeria', 'property'],
            favicon: '',
            logo: ''
          },
          email: {
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: '',
            smtpPass: '',
            smtpSecure: true,
            fromEmail: 'noreply@homely.ng',
            fromName: 'Homely',
            emailTemplates: {
              welcome: true,
              passwordReset: true,
              reportAcknowledged: true,
              reportResolved: true,
              propertyInquiry: true,
              serviceBooking: true,
              reviewNotification: true,
              newsletter: false
            }
          },
          security: {
            twoFactorAuth: false,
            sessionTimeout: 30,
            maxLoginAttempts: 5,
            passwordMinLength: 8,
            requireSpecialChar: true,
            requireNumber: true,
            requireUppercase: true,
            ipWhitelist: [],
            allowedDomains: [],
            recaptchaEnabled: false,
            recaptchaSiteKey: '',
            recaptchaSecretKey: ''
          },
          notifications: {
            emailNotifications: {
              newUserRegistration: true,
              newPropertyListing: true,
              newServiceListing: true,
              newReport: true,
              userSuspended: true,
              contentRemoved: true,
              dailyDigest: false,
              weeklyReport: true
            },
            pushNotifications: {
              enabled: false,
              newMessages: true,
              newReviews: true,
              systemAlerts: true
            },
            notificationChannels: {
              email: true,
              push: false,
              sms: false
            }
          },
          payment: {
            currency: 'NGN',
            currencySymbol: '₦',
            taxRate: 7.5,
            commissionRate: 5,
            featuredListingFee: 5000,
            minimumWithdrawal: 10000,
            paymentGateways: {
              paystack: { enabled: true, publicKey: '', secretKey: '' },
              flutterwave: { enabled: false, publicKey: '', secretKey: '' },
              stripe: { enabled: false, publicKey: '', secretKey: '' },
              bankTransfer: {
                enabled: true,
                bankName: 'First Bank',
                accountName: 'Homely Nigeria Ltd',
                accountNumber: '1234567890',
                sortCode: '011'
              }
            }
          },
          listing: {
            autoApproveProperties: false,
            autoApproveServices: false,
            requireVerification: true,
            maxImagesPerProperty: 10,
            maxImagesPerService: 8,
            featuredListingDuration: 30,
            listingExpiryDays: 90,
            allowPriceNegotiation: true,
            allowVirtualTours: true,
            moderationKeywords: ['scam', 'fraud'],
            bannedWords: ['scam', 'fraud'],
            categories: {
              properties: ['apartment', 'duplex', 'villa', 'bungalow'],
              services: ['inspection', 'legal', 'moving', 'cleaning']
            }
          },
          seo: {
            googleAnalyticsId: '',
            googleTagManagerId: '',
            googleSearchConsole: '',
            facebookPixelId: '',
            robotsTxt: 'User-agent: *\nAllow: /',
            sitemapEnabled: true,
            canonicalUrl: 'https://homely.ng',
            structuredData: true,
            ogImage: '',
            twitterCard: 'summary_large_image'
          },
          maintenance: {
            maintenanceMode: false,
            maintenanceMessage: 'Site is under maintenance. Please check back later.',
            allowedIps: [],
            backupFrequency: 'weekly',
            backupRetention: 30,
            logRetention: 90,
            debugMode: false,
            apiRateLimit: 100
          }
        };
      }

      res.status(200).json({
        success: true,
        settings
      });
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching settings',
        error: error.message
      });
    }
  }

  /**
   * Update settings
   */
  async updateSettings(req, res) {
    try {
      const { settings } = req.body;

      // Update or create settings in database
      let updatedSettings = await Settings.findOneAndUpdate(
        {}, // empty filter to update the first document
        { $set: settings },
        { new: true, upsert: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        settings: updatedSettings
      });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating settings',
        error: error.message
      });
    }
  }

  /**
   * Reset settings to default
   */
  async resetSettings(req, res) {
    try {
      // Delete existing settings
      await Settings.deleteMany({});

      // Return default settings
      const defaultSettings = {
        site: {
          siteName: 'Homely',
          siteUrl: 'https://homely.ng',
          siteDescription: 'Find your dream home in Nigeria',
          supportEmail: 'support@homely.ng',
          supportPhone: '+2348000000000',
          address: 'Lagos, Nigeria',
          socialLinks: {
            facebook: '',
            twitter: '',
            instagram: '',
            linkedin: '',
            youtube: ''
          },
          metaTitle: 'Homely - Nigeria\'s Premier Real Estate Platform',
          metaDescription: 'Find properties for sale and rent in Nigeria',
          metaKeywords: ['real estate', 'nigeria', 'property'],
          favicon: '',
          logo: ''
        },
        email: {
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpSecure: true,
          fromEmail: 'noreply@homely.ng',
          fromName: 'Homely',
          emailTemplates: {
            welcome: true,
            passwordReset: true,
            reportAcknowledged: true,
            reportResolved: true,
            propertyInquiry: true,
            serviceBooking: true,
            reviewNotification: true,
            newsletter: false
          }
        },
        security: {
          twoFactorAuth: false,
          sessionTimeout: 30,
          maxLoginAttempts: 5,
          passwordMinLength: 8,
          requireSpecialChar: true,
          requireNumber: true,
          requireUppercase: true,
          ipWhitelist: [],
          allowedDomains: [],
          recaptchaEnabled: false,
          recaptchaSiteKey: '',
          recaptchaSecretKey: ''
        },
        notifications: {
          emailNotifications: {
            newUserRegistration: true,
            newPropertyListing: true,
            newServiceListing: true,
            newReport: true,
            userSuspended: true,
            contentRemoved: true,
            dailyDigest: false,
            weeklyReport: true
          },
          pushNotifications: {
            enabled: false,
            newMessages: true,
            newReviews: true,
            systemAlerts: true
          },
          notificationChannels: {
            email: true,
            push: false,
            sms: false
          }
        },
        payment: {
          currency: 'NGN',
          currencySymbol: '₦',
          taxRate: 7.5,
          commissionRate: 5,
          featuredListingFee: 5000,
          minimumWithdrawal: 10000,
          paymentGateways: {
            paystack: { enabled: true, publicKey: '', secretKey: '' },
            flutterwave: { enabled: false, publicKey: '', secretKey: '' },
            stripe: { enabled: false, publicKey: '', secretKey: '' },
            bankTransfer: {
              enabled: true,
              bankName: 'First Bank',
              accountName: 'Homely Nigeria Ltd',
              accountNumber: '1234567890',
              sortCode: '011'
            }
          }
        },
        listing: {
          autoApproveProperties: false,
          autoApproveServices: false,
          requireVerification: true,
          maxImagesPerProperty: 10,
          maxImagesPerService: 8,
          featuredListingDuration: 30,
          listingExpiryDays: 90,
          allowPriceNegotiation: true,
          allowVirtualTours: true,
          moderationKeywords: ['scam', 'fraud'],
          bannedWords: ['scam', 'fraud'],
          categories: {
            properties: ['apartment', 'duplex', 'villa', 'bungalow'],
            services: ['inspection', 'legal', 'moving', 'cleaning']
          }
        },
        seo: {
          googleAnalyticsId: '',
          googleTagManagerId: '',
          googleSearchConsole: '',
          facebookPixelId: '',
          robotsTxt: 'User-agent: *\nAllow: /',
          sitemapEnabled: true,
          canonicalUrl: 'https://homely.ng',
          structuredData: true,
          ogImage: '',
          twitterCard: 'summary_large_image'
        },
        maintenance: {
          maintenanceMode: false,
          maintenanceMessage: 'Site is under maintenance. Please check back later.',
          allowedIps: [],
          backupFrequency: 'weekly',
          backupRetention: 30,
          logRetention: 90,
          debugMode: false,
          apiRateLimit: 100
        }
      };

      res.status(200).json({
        success: true,
        message: 'Settings reset to default',
        settings: defaultSettings
      });
    } catch (error) {
      console.error('Reset settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error resetting settings',
        error: error.message
      });
    }
  }
}

module.exports = new SettingsController();