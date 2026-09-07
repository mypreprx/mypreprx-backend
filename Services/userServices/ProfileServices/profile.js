import bcrypt from 'bcrypt';
import userModel from '../../../Models/userSchema.js';

export const updateProfileService = async (userId, updateData, file) => {
    const { username, email, password, confirmPassword } = updateData;

    const user = await userModel.findById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    if (username) user.username = username;
    if (email) user.email = email;

    if (password && confirmPassword) {
        if (password !== confirmPassword) {
            throw new Error("Passwords do not match");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
    }

    if (file) {
        const normalizedPath = file.path.replace(/\\/g, '/');
        const uploadsIndex = normalizedPath.indexOf('uploads/');
        user.profilePicture = uploadsIndex !== -1 ? normalizedPath.substring(uploadsIndex) : normalizedPath;
    }

    await user.save();
    return user;
};
