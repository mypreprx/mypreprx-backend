import adminModel from '../../../Models/adminSchema.js'
import userModel from '../../../Models/userSchema.js'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { getStripe } from '../../billingServices/stripeClient.js';

export const loginAdminService = async (credentials) => {
  const { email, password } = credentials;

  if (!email || !password) {
    throw new Error("Email and password required");
  }

  const admin = await adminModel.findOne({ email });
  if (!admin) {
    throw new Error("Admin not found");
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  admin.isOnline = true;
  await admin.save();

  const token = jwt.sign(
    { adminId: admin._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  admin.sessionToken = token;
  await admin.save();

  return {
    token,
    admin: {
      id: admin._id,
      username: admin.username,
      email: admin.email
    }
  };
};

export const logoutAdminService = async (adminId) => {
  if (adminId) {
    await adminModel.findByIdAndUpdate(adminId, { isOnline: false });
  }
};

export const getAdminDashboardService = async (adminId) => {
  const admin = await adminModel.findById(adminId);
  return admin;
};

export const getAllUsersService = async () => {
  // Never expose credentials to the admin browser:
  // - password      : bcrypt hash
  // - sessionToken  : the live bearer credential checked by VerifyUser
  // - stripeCustomerId : internal Stripe identifier the admin UI never renders
  const users = await userModel
    .find()
    .select('-password -sessionToken -stripeCustomerId')
    .sort({ createdAt: -1 });
  return users;
};

// Collections that hold rows owned by a user. Deleting the account without
// these would leave orphaned attempts, chats, notifications, etc. behind.
const USER_OWNED_COLLECTIONS = [
  ['affirmations', 'user'],
  ['chatsessions', 'userId'],
  ['flashcards', 'userId'],
  ['moodtrackers', 'userId'],
  ['motivationposts', 'author'],
  ['nclexattempts', 'userId'],
  ['notifications', 'user'],
  ['nursingtipschemas', 'user'],
  ['questionflags', 'user'],
  ['quizattempts', 'userId'],
  ['scriptingnotes', 'user'],
  ['studyactivities', 'userId'],
  ['studybuddies', 'creator'],
];

// Best effort: a deleted account must not keep billing in Stripe. Failures are
// logged, not thrown, so the hard delete still completes.
const detachStripeArtifacts = async (user) => {
  try {
    const stripe = getStripe();
    const subscriptionId = user.subscription?.stripeSubscriptionId;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
      if (subscription && subscription.status !== 'canceled') {
        await stripe.subscriptions.cancel(subscriptionId);
      }
    }
    const customerId = user.stripeCustomerId;
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId).catch(() => null);
      if (customer && !customer.deleted) {
        await stripe.customers.del(customerId);
      }
    }
  } catch (error) {
    console.error(`[delete-users] Stripe cleanup failed for ${user.email}:`, error.message);
  }
};

/**
 * Hard-deletes users. Admin accounts are never deletable through this path.
 * Returns the number of accounts removed plus their emails.
 */
export const deleteUsersService = async (userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    const err = new Error('No users selected');
    err.status = 400;
    throw err;
  }

  const ids = [...new Set(userIds.map((id) => String(id).trim()))];
  if (ids.length > 200) {
    const err = new Error('Too many users selected (max 200)');
    err.status = 400;
    throw err;
  }
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    const err = new Error('One or more user ids are invalid');
    err.status = 400;
    throw err;
  }

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const users = await userModel
    .find({ _id: { $in: objectIds } })
    .select('email role subscription stripeCustomerId');

  if (users.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const deletable = users.filter((user) => user.role !== 'admin');
  if (deletable.length === 0) {
    const err = new Error('Admin accounts cannot be deleted');
    err.status = 403;
    throw err;
  }

  const deletableIds = deletable.map((user) => user._id);

  for (const user of deletable) {
    // eslint-disable-next-line no-await-in-loop
    await detachStripeArtifacts(user);
  }

  const db = mongoose.connection.db;
  for (const [collection, field] of USER_OWNED_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection(collection).deleteMany({ [field]: { $in: deletableIds } });
  }

  // Remove the deleted users from other people's shared posts/threads.
  await db.collection('motivationposts').updateMany(
    {},
    { $pull: { likes: { $in: deletableIds }, comments: { user: { $in: deletableIds } } } }
  );
  await db.collection('studybuddies').updateMany(
    {},
    { $pull: { replies: { user: { $in: deletableIds } } } }
  );

  const result = await userModel.deleteMany({ _id: { $in: deletableIds } });

  return {
    deletedCount: result.deletedCount,
    emails: deletable.map((user) => user.email),
    skippedAdmins: users.length - deletable.length,
  };
};
