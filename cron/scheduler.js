// cron/scheduler.js
import cron from 'node-cron';
import Notification from '../models/notificationModel.js';

const TTL_MINUTES = 3;

export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

      console.log(`⏰ Running scheduler at ${now.toISOString()}`);
      console.log(`🔍 Checking for scheduled jobs to activate...`);
      console.log(`📅 Current time: ${now.toISOString()}`);

      // Fetch the jobs BEFORE updating so we can log their details
      const jobsToActivate = await Notification.find({
        isScheduled: true,
        status: 'scheduled',
        scheduledAt: { $lte: now }
      }).select('bookingId serviceName customer scheduledAt servicePrice');

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
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║           🚀 SCHEDULED JOBS ACTIVATED 🚀                  ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  ⏰ Activated At : ${now.toISOString()}        ║`);
        console.log(`║  📦 Total Jobs   : ${result.modifiedCount} job(s) activated                      ║`);
        console.log(`║  ⌛ Expires At   : ${expiresAt.toISOString()}        ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');

        jobsToActivate.forEach((job, index) => {
          console.log(`║  📋 Job ${index + 1}:                                                 ║`);
          console.log(`║     🆔 Booking ID  : ${job.bookingId}`);
          console.log(`║     🔧 Service     : ${job.serviceName}`);
          console.log(`║     👤 Customer    : ${job.customer?.name || 'N/A'}`);
          console.log(`║     📞 Phone       : ${job.customer?.phone || 'N/A'}`);
          console.log(`║     💰 Price       : ${job.servicePrice} BHD`);
          console.log(`║     📅 Scheduled At: ${job.scheduledAt?.toISOString()}`);
          if (index < jobsToActivate.length - 1) {
            console.log('╠════════════════════════════════════════════════════════════╣');
          }
        });

        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  ✅ STATUS: scheduled → pending (now visible to providers) ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\n');
      }

    } catch (err) {
      console.error('❌ Scheduler cron error:', err);
    }
  });

  console.log('🕐 Job scheduler started');
};