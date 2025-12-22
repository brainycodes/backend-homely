const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD
      }
    });
  }

  async sendVerificationEmail(user, verificationLink) {
    const mailOptions = {
      from: `"Homely 🏡" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: 'Welcome to Homely! Please verify your email',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Homely Account</title>
          <style>
            /* Reset & Base */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #374151;
              background-color: #f9fafb;
              -webkit-font-smoothing: antialiased;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
              border: 1px solid #e5e7eb;
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              padding: 40px 30px;
              text-align: center;
              position: relative;
            }
            
            .logo {
              display: inline-block;
              background: rgba(255, 255, 255, 0.2);
              width: 60px;
              height: 60px;
              border-radius: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 20px;
              backdrop-filter: blur(10px);
            }
            
            .logo-text {
              color: white;
              font-size: 32px;
              font-weight: 600;
            }
            
            .header-title {
              color: white;
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 8px;
              letter-spacing: -0.5px;
            }
            
            .header-subtitle {
              color: rgba(255, 255, 255, 0.9);
              font-size: 16px;
              font-weight: 500;
            }
            
            /* Content */
            .email-content {
              padding: 40px 30px;
            }
            
            .greeting {
              font-size: 24px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 24px;
            }
            
            .greeting-name {
              color: #10b981;
            }
            
            .intro-text {
              font-size: 16px;
              color: #6b7280;
              margin-bottom: 32px;
              line-height: 1.7;
            }
            
            /* Verification Section */
            .verification-section {
              background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
              border-radius: 12px;
              padding: 32px;
              margin: 32px 0;
              text-align: center;
              border: 1px solid #bbf7d0;
            }
            
            .verification-icon {
              font-size: 48px;
              margin-bottom: 20px;
              color: #10b981;
            }
            
            .verification-title {
              font-size: 20px;
              font-weight: 600;
              color: #065f46;
              margin-bottom: 12px;
            }
            
            .verification-text {
              font-size: 15px;
              color: #047857;
              margin-bottom: 24px;
              opacity: 0.9;
            }
            
            /* Button */
            .verify-button {
              display: inline-block;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white !important;
              text-decoration: none;
              padding: 16px 40px;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              letter-spacing: 0.5px;
              transition: all 0.3s ease;
              box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
              border: none;
              cursor: pointer;
            }
            
            .verify-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
            }
            
            /* Link Fallback */
            .link-fallback {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 20px;
              margin: 32px 0;
              word-break: break-all;
            }
            
            .link-label {
              font-size: 14px;
              color: #6b7280;
              margin-bottom: 8px;
              font-weight: 500;
            }
            
            .link-url {
              font-size: 14px;
              color: #059669;
              font-family: 'SF Mono', Monaco, 'Courier New', monospace;
              line-height: 1.5;
            }
            
            /* Info Box */
            .info-box {
              background: #fef3c7;
              border: 1px solid #fde68a;
              border-radius: 8px;
              padding: 16px;
              margin: 24px 0;
            }
            
            .info-title {
              font-size: 14px;
              font-weight: 600;
              color: #92400e;
              margin-bottom: 4px;
            }
            
            .info-text {
              font-size: 14px;
              color: #92400e;
              opacity: 0.9;
            }
            
            /* Footer */
            .email-footer {
              padding: 30px;
              background: #f9fafb;
              border-top: 1px solid #e5e7eb;
              text-align: center;
            }
            
            .social-links {
              display: flex;
              justify-content: center;
              gap: 20px;
              margin-bottom: 24px;
            }
            
            .social-link {
              color: #6b7280;
              text-decoration: none;
              font-size: 14px;
              transition: color 0.2s;
            }
            
            .social-link:hover {
              color: #10b981;
            }
            
            .footer-text {
              font-size: 13px;
              color: #9ca3af;
              line-height: 1.5;
              margin-bottom: 8px;
            }
            
            .footer-copyright {
              font-size: 12px;
              color: #9ca3af;
            }
            
            /* Responsive */
            @media (max-width: 600px) {
              .email-header {
                padding: 30px 20px;
              }
              
              .header-title {
                font-size: 24px;
              }
              
              .email-content {
                padding: 30px 20px;
              }
              
              .verification-section {
                padding: 24px 20px;
                margin: 24px 0;
              }
              
              .verify-button {
                padding: 14px 32px;
                font-size: 15px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <!-- Header -->
            <div class="email-header">
              <h1 class="header-title">Welcome to Homely</h1>
              <p class="header-subtitle">Your journey to finding the perfect home starts here</p>
            </div>
            
            <!-- Content -->
            <div class="email-content">
              <h2 class="greeting">
                Hello <span class="greeting-name">${user.firstName}</span>!
              </h2>
              
              <p class="intro-text">
                Thank you for choosing Homely as your real estate partner. We're excited to have you on board! 
                To get started and access all the amazing features we offer, please verify your email address.
              </p>
              
              <!-- Verification Section -->
              <div class="verification-section">
                <div class="verification-icon">✉️</div>
                <h3 class="verification-title">Verify Your Email Address</h3>
                <p class="verification-text">
                  Click the button below to confirm your email and activate your account
                </p>
                
                <a href="${verificationLink}" class="verify-button">
                  Verify Email Address
                </a>
              </div>
              
              <!-- Link Fallback -->
              <div class="link-fallback">
                <div class="link-label">Or copy and paste this link in your browser:</div>
                <div class="link-url">${verificationLink}</div>
              </div>
              
              <!-- Info Box -->
              <div class="info-box">
                <div class="info-title">⏰ Important Notice</div>
                <div class="info-text">
                  This verification link will expire in 24 hours. If you don't verify within this time, 
                  you'll need to request a new verification email.
                </div>
              </div>
              
              <p class="intro-text">
                If you didn't create an account with Homely, you can safely ignore this email. 
                Someone might have entered your email address by mistake.
              </p>
            </div>
            
            <!-- Footer -->
            <div class="email-footer">
              <p class="footer-text">
                Homely Real Estate Platform<br>
                123 Real Estate Street, Your City, Country
              </p>
              
              <p class="footer-copyright">
                © ${new Date().getFullYear()} Homely. All rights reserved.<br>
                This email was sent to ${user.email} as part of your Homely account registration.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
      return false;
    }
  }

  async sendWelcomeEmail(user) {
    const userDashboardUrl = `${process.env.CLIENT_URL}/dashboard`;
    const profileUrl = `${process.env.CLIENT_URL}/dashboard/profile`;
    const exploreUrl = `${process.env.CLIENT_URL}/properties`;

    const mailOptions = {
      from: `"Homely 🏡" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: '🎉 Welcome to Homely! Your Account is Ready',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Homely</title>
          <style>
            /* Reset & Base */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #374151;
              background-color: #f9fafb;
              -webkit-font-smoothing: antialiased;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
              border: 1px solid #e5e7eb;
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              padding: 50px 30px;
              text-align: center;
              position: relative;
            }
            
            .header-content {
              position: relative;
              z-index: 1;
            }
            
            .confetti {
              font-size: 48px;
              margin-bottom: 20px;
              animation: float 3s ease-in-out infinite;
            }
            
            @keyframes float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-10px); }
            }
            
            .header-title {
              color: white;
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 8px;
              letter-spacing: -0.5px;
            }
            
            .header-subtitle {
              color: rgba(255, 255, 255, 0.9);
              font-size: 18px;
              font-weight: 500;
            }
            
            /* Content */
            .email-content {
              padding: 40px 30px;
            }
            
            .greeting {
              font-size: 28px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 24px;
              text-align: center;
            }
            
            .greeting-name {
              color: #10b981;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            
            .success-message {
              text-align: center;
              font-size: 18px;
              color: #10b981;
              font-weight: 600;
              margin-bottom: 32px;
              padding: 12px 24px;
              background: #f0fdf4;
              border-radius: 12px;
              display: inline-block;
            }
            
            .intro-text {
              font-size: 16px;
              color: #6b7280;
              margin-bottom: 32px;
              line-height: 1.7;
              text-align: center;
            }
            
            /* Dashboard Card */
            .dashboard-card {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border-radius: 12px;
              padding: 32px;
              margin: 32px 0;
              text-align: center;
              border: 1px solid #e2e8f0;
            }
            
            .dashboard-icon {
              font-size: 56px;
              margin-bottom: 20px;
              color: #10b981;
            }
            
            .dashboard-title {
              font-size: 22px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 12px;
            }
            
            .dashboard-text {
              font-size: 15px;
              color: #6b7280;
              margin-bottom: 24px;
            }
            
            .dashboard-button {
              display: inline-block;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              text-decoration: none;
              padding: 16px 40px;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              letter-spacing: 0.5px;
              transition: all 0.3s ease;
              box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
            }
            
            .dashboard-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
            }
            
            /* Next Steps */
            .next-steps {
              margin: 40px 0;
            }
            
            .steps-title {
              font-size: 20px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 24px;
              text-align: center;
            }
            
            .steps-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin-top: 24px;
            }
            
            .step-card {
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 24px;
              transition: all 0.3s ease;
            }
            
            .step-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
              border-color: #10b981;
            }
            
            .step-number {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 600;
              font-size: 16px;
              margin-bottom: 16px;
            }
            
            .step-title {
              font-size: 16px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 8px;
            }
            
            .step-description {
              font-size: 14px;
              color: #6b7280;
              line-height: 1.5;
            }
            
            /* Quick Links */
            .quick-links {
              background: #f0fdf4;
              border-radius: 12px;
              padding: 24px;
              margin: 32px 0;
              border: 1px solid #bbf7d0;
            }
            
            .quick-links-title {
              font-size: 18px;
              font-weight: 600;
              color: #065f46;
              margin-bottom: 16px;
            }
            
            .links-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
              gap: 12px;
            }
            
            .link-item {
              display: block;
              padding: 12px 16px;
              background: white;
              border-radius: 8px;
              text-decoration: none;
              color: #374151;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s ease;
              border: 1px solid #e5e7eb;
            }
            
            .link-item:hover {
              background: #10b981;
              color: white;
              border-color: #10b981;
            }
            
            /* Footer */
            .email-footer {
              padding: 30px;
              background: #f9fafb;
              border-top: 1px solid #e5e7eb;
              text-align: center;
            }
            
            .support-section {
              margin-bottom: 24px;
            }
            
            .support-title {
              font-size: 16px;
              font-weight: 600;
              color: #374151;
              margin-bottom: 8px;
            }
            
            .support-text {
              font-size: 14px;
              color: #6b7280;
              margin-bottom: 16px;
            }
            
            .support-button {
              display: inline-block;
              background: white;
              color: #10b981;
              text-decoration: none;
              padding: 10px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              border: 2px solid #10b981;
              transition: all 0.2s ease;
            }
            
            .support-button:hover {
              background: #10b981;
              color: white;
            }
            
            .footer-text {
              font-size: 13px;
              color: #9ca3af;
              line-height: 1.5;
              margin-bottom: 8px;
            }
            
            .footer-copyright {
              font-size: 12px;
              color: #9ca3af;
            }
            
            /* Responsive */
            @media (max-width: 600px) {
              .email-header {
                padding: 40px 20px;
              }
              
              .header-title {
                font-size: 26px;
              }
              
              .email-content {
                padding: 30px 20px;
              }
              
              .dashboard-card {
                padding: 24px 20px;
                margin: 24px 0;
              }
              
              .steps-grid {
                grid-template-columns: 1fr;
              }
              
              .links-grid {
                grid-template-columns: 1fr;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <!-- Header -->
            <div class="email-header">
              <div class="header-content">
                <div class="confetti">🎉</div>
                <h1 class="header-title">Welcome to Homely!</h1>
                <p class="header-subtitle">Your real estate journey begins now</p>
              </div>
            </div>
            
            <!-- Content -->
            <div class="email-content">
              <h2 class="greeting">
                Congratulations, <span class="greeting-name">${user.firstName}</span>!
              </h2>
              
              <div class="success-message">
                ✅ Your email has been successfully verified!
              </div>
              
              <p class="intro-text">
                Your Homely account is now fully activated and ready to use. 
                We're thrilled to have you as part of our growing community!
              </p>
              
              <!-- Dashboard Access -->
              <div class="dashboard-card">
                <div class="dashboard-icon">🚀</div>
                <h3 class="dashboard-title">Ready to Explore?</h3>
                <p class="dashboard-text">
                  Access your personalized dashboard to start your property journey
                </p>
                
                <a href="${userDashboardUrl}" class="dashboard-button">
                  Go to Dashboard
                </a>
              </div>
              
              <!-- Next Steps -->
              <div class="next-steps">
                <h3 class="steps-title">Your Next Steps</h3>
                
                <div class="steps-grid">
                  <div class="step-card">
                    <div class="step-number">1</div>
                    <h4 class="step-title">Complete Your Profile</h4>
                    <p class="step-description">
                      Add your photo and preferences to get personalized property recommendations
                    </p>
                  </div>
                  
                  <div class="step-card">
                    <div class="step-number">2</div>
                    <h4 class="step-title">Explore Properties</h4>
                    <p class="step-description">
                      Browse thousands of verified properties with detailed information
                    </p>
                  </div>
                  
                  <div class="step-card">
                    <div class="step-number">3</div>
                    <h4 class="step-title">Save & Compare</h4>
                    <p class="step-description">
                      Save your favorite properties and compare them side by side
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Quick Links -->
              <div class="quick-links">
                <h4 class="quick-links-title">Quick Access</h4>
                <div class="links-grid">
                  <a href="${profileUrl}" class="link-item">📝 Complete Profile</a>
                  <a href="${exploreUrl}" class="link-item">🔍 Browse Properties</a>
                  <a href="${userDashboardUrl}" class="link-item">⭐ Saved Properties</a>
                  <a href="${process.env.CLIENT_URL}/agents" class="link-item">👥 Find Agents</a>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="email-footer">
              <div class="support-section">
                <h4 class="support-title">Need Help Getting Started?</h4>
                <p class="support-text">
                  Our support team is here to help you make the most of your Homely experience
                </p>
                <a href="${process.env.CLIENT_URL}/contact" class="support-button">
                  Contact Support
                </a>
              </div>
              
              <p class="footer-text">
                Homely Real Estate Platform<br>
                Making property dreams a reality
              </p>
              
              <p class="footer-copyright">
                © ${new Date().getFullYear()} Homely. All rights reserved.<br>
                This email was sent to ${user.email} as part of your Homely account.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Welcome email error:', error);
      return false;
    }
  }
}

module.exports = new EmailService();