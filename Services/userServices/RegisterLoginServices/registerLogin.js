import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import userModel from '../../../Models/userSchema.js';
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleAuthService = async (googleToken) => {
  // 1. Verify the token with Google
  const ticket = await client.verifyIdToken({
    idToken: googleToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  // Extract given_name (first name) directly from Google's payload
  const { name, email, picture, sub, given_name } = ticket.getPayload();

  // 2. Check if user exists
  let user = await userModel.findOne({ email });
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    // --- NEW: Extract first name and ensure uniqueness ---
    // Use Google's given_name if available, otherwise grab the first word of the full name
    let firstName = given_name || name.split(' ')[0];
    
    // Format the username: lowercase and remove any spaces (e.g., "Muhammad" -> "muhammad")
    let baseUsername = firstName.toLowerCase().replace(/\s+/g, ''); 
    
    let uniqueUsername = baseUsername;
    let usernameExists = await userModel.findOne({ username: uniqueUsername });
    let counter = 1;

    // Loop until we find an available username (e.g., muhammad, muhammad1, muhammad2)
    while (usernameExists) {
      uniqueUsername = `${baseUsername}${counter}`;
      usernameExists = await userModel.findOne({ username: uniqueUsername });
      counter++;
    }
    // --------------------------------------------------

    // 3. Create user if they don't exist
    const generatedPassword = await bcrypt.hash(sub + process.env.JWT_SECRET, 10);
    user = await userModel.create({
      username: uniqueUsername, // e.g., "muhammad" or "muhammad1"
      email: email,
      password: generatedPassword, 
      role: 'user', 
      isOnline: true
    });
  } else {
    user.isOnline = true;
    await user.save();
  }

  // 4. Generate JWT Token
  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '3h' }
  );

  user.sessionToken = token;
  await user.save();

  return { token, user, isNewUser };
};
export const registerUserService = async (userData) => {
  const { username, email, password, confirmpassword } = userData;

  const existingUser = await userModel.findOne({ email });
  if (existingUser) {
    throw new Error("User Already exists");
  }

  if (password !== confirmpassword) {
    throw new Error("Password should be same");
  }

  const hashedpassword = await bcrypt.hash(password, 10);
  const newUser = await userModel.create({
    username,
    email,
    password: hashedpassword,
    // Never trust a client-supplied role. A JWT with role "admin" resolves against
    // adminModel in VerifyUser and would lock the account out of every route.
    role: 'user'
  });

  return newUser;
};

export const loginUserService = async (credentials) => {
  const { email, password } = credentials;

  const existingUser = await userModel.findOne({ email });
  if (!existingUser) {
    throw new Error("User not found");
  }

  const ispasswordCorrect = await bcrypt.compare(password, existingUser.password);
  if (!ispasswordCorrect) {
    throw new Error("Invalid Credentials");
  }

  existingUser.isOnline = true;
  await existingUser.save();

  const token = jwt.sign(
    {
      id: existingUser._id,
      email: existingUser.email,
      role: existingUser.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '3h' }
  );

  existingUser.sessionToken = token;
  await existingUser.save();

  return { token, user: existingUser };
};

export const logoutUserService = async (userId) => {
  if (userId) {
    await userModel.findByIdAndUpdate(userId, { isOnline: false });
  }
};

export const getUserHomeService = async (userID) => {
  // The client only needs identity + entitlement (subscription) to drive routing.
  // Never send credentials to the browser.
  const user = await userModel
    .findById(userID)
    .select('-password -sessionToken');
  return user;
};
