// cron/scheduler.js
import cron from 'node-cron';
import Notification from '../models/notificationModel.js';

const TTL_MINUTES = 3;

export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

      const result = await Notification.updateMany(
        {
          isScheduled: true,
          status: 'scheduled',
          scheduledAt: { $lte: now }
        },
        {
          $set: {
            isScheduled: false,
            status: 'pending',
            expiresAt
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Activated ${result.modifiedCount} scheduled job(s) at ${now.toISOString()}`);
      }

    } catch (err) {
      console.error('❌ Scheduler cron error:', err);
    }
  });

  console.log('🕐 Job scheduler started');
};