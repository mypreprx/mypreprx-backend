import crypto from 'crypto';
import bcrypt from 'bcrypt';
import userModel from '../../../Models/userSchema.js';
import sendEmail from '../../../utilities/sendEmail.js';

export const forgotPasswordService = async (email) => {
  const user = await userModel.findOne({ email });
  if (!user) {
    throw new Error('User with this email does not exist.');
  }

  // Generate a random token
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Set token and expiry (1 hour)
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = Date.now() + 3600000;
  
  await user.save({ validateBeforeSave: false });

  // Create the reset URL
  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetURL}`;
  
  const html = `
    <h1>Password Reset Request</h1>
    <p>You are receiving this email because you (or someone else) has requested the reset of a password.</p>
    <p>Click the link below to reset your password:</p>
    <a href="${resetURL}" style="display:inline-block;padding:10px 20px;color:white;background-color:#083862;text-decoration:none;border-radius:5px;">Reset Password</a>
    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: 'PreprX - Password Reset Token',
      message,
      html
    });
    return { message: 'Token sent to email!' };
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw new Error('There was an error sending the email. Try again later.');
  }
};

export const resetPasswordService = async (token, newPassword) => {
  // Hash token to compare with DB
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await userModel.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error('Token is invalid or has expired.');
  }

  // Set new password
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();
  return { message: 'Password reset successful!' };
};
