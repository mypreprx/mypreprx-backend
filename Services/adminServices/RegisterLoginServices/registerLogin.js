import adminModel from '../../../Models/adminSchema.js'
import userModel from '../../../Models/userSchema.js'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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
