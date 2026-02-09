const NotificationController = require('../controllers/notificationController');
const Notification = require('../models/Notification');
const cron = require('node-cron');

class EmailNotificationsJob {
  constructor() {
    this.jobs = [];
  }
  
  start() {
    // Run every 2 hours for batched emails
    const batchedEmailJob = cron.schedule('0 */2 * * *', async () => {
      console.log('🔄 Running batched email notifications job...');
      try {
        await NotificationController.processPendingEmailNotifications();
      } catch (err) {
        console.error('❌ Batched email job error:', err.message);
      }
    });

    // Run daily at midnight for cleanup
    const cleanupJob = cron.schedule('0 0 * * *', async () => {
      console.log('🧹 Running notification cleanup job...');
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const result = await Notification.deleteMany({
          read: true,
          emailed: true,
          createdAt: { $lt: thirtyDaysAgo }
        });

        console.log(`✅ Cleaned up ${result.deletedCount} old notifications`);
      } catch (err) {
        console.error('❌ Cleanup job error:', err.message);
      }
    });

    this.jobs.push(batchedEmailJob, cleanupJob);

    console.log('✅ Email notifications jobs started');
  }
  
  stop() {
    this.jobs.forEach(job => job.stop());
    console.log('🛑 Email notifications jobs stopped');
  }
}

module.exports = new EmailNotificationsJob();