const NotificationController = require('../controllers/notificationController');
const Notification = require('../models/Notification'); // <-- ADD THIS
const cron = require('node-cron');

class EmailNotificationsJob {
  constructor() {
    this.jobs = []; // store multiple jobs
  }
  
  start() {
    // Run every 15 minutes
    const emailJob = cron.schedule('*/15 * * * *', async () => {
      console.log('Running email notifications job...');
      try {
        await NotificationController.processPendingEmailNotifications();
      } catch (err) {
        console.error('Email job error:', err.message);
      }
    });

    // Run daily at midnight
    const cleanupJob = cron.schedule('0 0 * * *', async () => {
      console.log('Running notification cleanup job...');
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const result = await Notification.deleteMany({
          read: true,
          emailed: true,
          createdAt: { $lt: thirtyDaysAgo }
        });

        console.log(`Cleaned up ${result.deletedCount} old notifications`);
      } catch (err) {
        console.error('Cleanup job error:', err.message);
      }
    });

    this.jobs.push(emailJob, cleanupJob);

    console.log('Email notifications jobs started');
  }
  
  stop() {
    this.jobs.forEach(job => job.stop());
    console.log('Email notifications jobs stopped');
  }
}

module.exports = new EmailNotificationsJob();
