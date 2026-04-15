// cron/scheduler.js
import cron from 'node-cron';
import Notification from '../models/notificationModel.js';
import User from '../models/userModel.js';
import { Expo } from 'expo-server-sdk';

const TTL_MINUTES = 3;
const expo = new Expo();

/**
 * Sends an Expo push notification to a single token.
 * Never throws — failures are logged and swallowed so they
 * never affect the already-committed job.
 */
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

  console.log(`✅ Token is valid Expo push token`);

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
      console.warn(`⚠️  Expo ticket error: ${ticket.message} (details: ${JSON.stringify(ticket.details)})`);
    } else {
      console.log(`✅ Push notification delivered — receipt id: ${ticket.id}`);
    }
  } catch (err) {
    console.warn(`⚠️  Expo push failed: ${err.message}`);
  }

  console.log(`===== SEND PUSH NOTIFICATION END =====\n`);
};

export const activateScheduledJobsForCustomer = async (customerId) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

  // Check if customer has active service first
  const customer = await User.findById(customerId).select('currentServiceId');
  if (customer?.currentServiceId) {
    console.log(`⏸ Cannot activate jobs - customer ${customerId} has active service: ${customer.currentServiceId}`);
    return [];
  }

  const jobs = await Notification.find({
    isScheduled: true,
    status: 'scheduled',
    scheduledAt: { $lte: now },
    'customer._id': customerId
  }).select('bookingId serviceName customer scheduledAt servicePrice');

  if (!jobs.length) return [];

  const ids = jobs.map((j) => j._id);

  await Notification.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        isScheduled: false,
        status: 'pending',
        expiresAt,
        activeServiceNotificationSent: false
      }
    }
  );

  console.log(`✅ [activateScheduledJobsForCustomer] Activated ${jobs.length} job(s) for customer ${customerId}`);
  return jobs;
};

export const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

      console.log(`⏰ Running scheduler at ${now.toISOString()}`);

      const jobsToActivate = await Notification.find({
        isScheduled: true,
        status: 'scheduled',
        scheduledAt: { $lte: now }
      }).select('bookingId serviceName customer scheduledAt servicePrice activeServiceNotificationSent');

      if (jobsToActivate.length > 0) {
        const readyIds = [];
        const blockedIds = [];

        for (const job of jobsToActivate) {
          const customerId = job.customer?._id;

          if (!customerId) {
            readyIds.push(job._id);
            continue;
          }

          const customer = await User.findById(customerId).select('currentServiceId pushToken fullName');

          // FIX: Only block if currentServiceId exists AND is not null/empty
          if (customer?.currentServiceId && customer.currentServiceId !== null && customer.currentServiceId !== '') {
            blockedIds.push(job._id);

            if (!job.activeServiceNotificationSent) {
              if (customer.pushToken) {
                await sendExpoNotification({
                  token: customer.pushToken,
                  title: '⏳ Scheduled Service On Hold',
                  body: `Hi ${customer.fullName || 'there'}, your scheduled service "${job.serviceName}" cannot start because you have an active service in progress. Please complete your current service first.`,
                  data: { bookingId: job.bookingId, type: 'scheduled_blocked' }
                });
              }

              await Notification.findByIdAndUpdate(job._id, {
                $set: { activeServiceNotificationSent: true }
              });

              console.log(`🔔 Blocked job ${job.bookingId} — customer has active service: ${customer.currentServiceId}`);
            } else {
              console.log(`⏸ Blocked job ${job.bookingId} — customer still busy.`);
            }
          } else {
            // ONLY activate if NO active service
            readyIds.push(job._id);
          }
        }

        if (readyIds.length > 0) {
          const result = await Notification.updateMany(
            { _id: { $in: readyIds } },
            {
              $set: {
                isScheduled: false,
                status: 'pending',
                expiresAt
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
          console.log(`║  📦 Total Jobs   : ${result.modifiedCount} job(s) activated                      ║`);
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

        if (blockedIds.length > 0) {
          console.log(`⏸ ${blockedIds.length} job(s) held back — customers have active services.`);
        }
      }

    } catch (err) {
      console.error('❌ Scheduler cron error:', err);
    }
  });

  console.log('🕐 Job scheduler started');
};