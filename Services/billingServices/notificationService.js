import notificationModel from '../../Models/notificationSchema.js';
import sendEmail from '../../utilities/sendEmail.js';

const billingEmailLayout = (heading, bodyLines, footerNote) => `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px;">
    <h2 style="color: #072445; margin: 0 0 12px 0; font-size: 20px;">${heading}</h2>
    ${bodyLines.map((line) => `<p style="color: #213547; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">${line}</p>`).join('')}
    <p style="color: #555555; font-size: 12px; margin: 20px 0 0 0;">${footerNote}</p>
  </div>
`;

/**
 * Create in-app notification, emit over Socket.io if available, and optionally send email.
 * Socket is already used by this app (Study Buddy) — used here for billing notifications.
 */
export const notifyUser = async ({
  userId,
  io = null,
  title,
  message,
  emailSubject,
  emailLines,
  sendEmailFlag = true,
}) => {
  if (!userId) return null;

  const results = { notification: null, email: null };

  try {
    results.notification = await notificationModel.create({
      user: userId,
      type: 'billing',
      title,
      message,
    });

    if (io) {
      io.to(`user_${userId}`).emit('notification', {
        id: results.notification._id,
        type: 'billing',
        title,
        message,
        createdAt: results.notification.createdAt,
      });
    }
  } catch (err) {
    console.error('In-app notification failed:', err.message);
  }

  if (sendEmailFlag && emailSubject && emailLines) {
    try {
      const userDoc = await import('../../Models/userSchema.js').then((m) => m.default.findById(userId).select('email username'));
      if (userDoc?.email) {
        await sendEmail({
          email: userDoc.email,
          subject: emailSubject,
          message: emailLines.join(' '),
          html: billingEmailLayout(title, emailLines, 'This is an automated message from PrepRX.'),
        });
        results.email = true;
      }
    } catch (err) {
      console.error('Billing email failed:', err.message);
    }
  }

  return results;
};

export const listNotificationsService = async (userId, { limit = 50 } = {}) => {
  return notificationModel
    .find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

export const markNotificationsReadService = async (userId) => {
  await notificationModel.updateMany({ user: userId, read: false }, { read: true });
  return true;
};
