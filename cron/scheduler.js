// cron/scheduler.js
import cron from 'node-cron';
import Notification from '../models/notificationModel.js';
import User from '../models/userModel.js';
import { Expo } from 'expo-server-sdk';

const TTL_MINUTES = 3;
const expo = new Expo();

const sendExpoNotification = async ({ token, title, body, data = {} }) => {
  console.log(`\n📲 ===== SEND PUSH NOTIFICATION =====`);
  console.log(`   Token:  ${token}`);
  console.log(`   Title:  ${title}`);
  console.log(`   Body:   ${body}`);
  console.log(`   Data:   ${JSON.stringify(data)}`);

  if (!Expo.isExpoPushToken(token)) {
    console.warn(`⚠️  Invalid Expo push token, skipping: ${token}`);
    return;
  }

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([
      {
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high'
      }
    ]);

    console.log(`📬 Expo ticket received:`, JSON.stringify(ticket));

    if (ticket.status === 'error') {
      console.warn(`⚠️  Expo ticket error: ${ticket.message}`);
    } else {
      console.log(`✅ Push notification delivered — receipt id: ${ticket.id}`);
    }
  } catch (err) {
    console.warn(`⚠️  Expo push failed: ${err.message}`);
  }
};

export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

      console.log(`⏰ Running scheduler at ${now.toISOString()}`);

      // Find jobs that are scheduled and due to activate
      const jobsToActivate = await Notification.find({
        isScheduled: true,
        status: 'scheduled',
        scheduledAt: { $lte: now }
      }).select('bookingId serviceName customerId customer scheduledAt servicePrice activeServiceNotificationSent');

      if (jobsToActivate.length === 0) {
        console.log(`📭 No scheduled jobs to activate`);
        return;
      }

      console.log(`📋 Found ${jobsToActivate.length} job(s) due for activation`);
      
      const readyIds = [];

      for (const job of jobsToActivate) {
        const customerId = job.customerId;

        if (!customerId) {
          console.log(`⚠️ Job ${job.bookingId} has no customer ID - skipping`);
          continue;
        }

        const customer = await User.findById(customerId).select('currentServiceId pushToken fullName');
        
        const hasActiveService = customer?.currentServiceId && 
                                 typeof customer.currentServiceId === 'string' &&
                                 customer.currentServiceId.trim().length > 0;

        if (hasActiveService) {
          // Customer has active service - job stays scheduled
          console.log(`⏸ Job ${job.bookingId} on hold - customer has active service: ${customer.currentServiceId}`);
          
          // Send notification only once
          if (!job.activeServiceNotificationSent && customer.pushToken) {
            await sendExpoNotification({
              token: customer.pushToken,
              title: '⏳ Scheduled Service On Hold',
              body: `Hi ${customer.fullName || 'there'}, you already have an active service in progress. Please complete it or cancel it before starting a new one.`,
              data: { bookingId: job.bookingId, type: 'scheduled_blocked' }
            });
            
            await Notification.findByIdAndUpdate(job._id, {
              $set: { activeServiceNotificationSent: true }
            });
            
            console.log(`📱 Notification sent for ${job.bookingId} (first and only time)`);
          }
          
          // DO NOTHING ELSE - job remains scheduled
          continue;
        }
        
        // No active service - activate the job
        console.log(`✅ Activating job ${job.bookingId} - no active service`);
        readyIds.push(job._id);
      }

      // Activate jobs that are ready
      if (readyIds.length > 0) {
        await Notification.updateMany(
          { _id: { $in: readyIds } },
          {
            $set: {
              isScheduled: false,
              status: 'pending',
              expiresAt,
              activeServiceNotificationSent: false
            }
          }
        );

        const activatedJobs = jobsToActivate.filter((j) =>
          readyIds.some((id) => id.equals(j._id))
        );

        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║           🚀 SCHEDULED JOBS ACTIVATED 🚀                  ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  ⏰ Activated At : ${now.toISOString()}        ║`);
        console.log(`║  📦 Total Jobs   : ${activatedJobs.length} job(s) activated                      ║`);
        console.log(`║  ⌛ Expires At   : ${expiresAt.toISOString()}        ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');

        activatedJobs.forEach((job, index) => {
          console.log(`║  📋 Job ${index + 1}:                                                 ║`);
          console.log(`║     🆔 Booking ID  : ${job.bookingId}`);
          console.log(`║     🔧 Service     : ${job.serviceName}`);
          console.log(`║     👤 Customer    : ${job.customer?.name || 'N/A'}`);
          console.log(`║     📞 Phone       : ${job.customer?.phone || 'N/A'}`);
          console.log(`║     💰 Price       : ${job.servicePrice} BHD`);
          console.log(`║     📅 Scheduled At: ${job.scheduledAt?.toISOString()}`);
          if (index < activatedJobs.length - 1) {
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