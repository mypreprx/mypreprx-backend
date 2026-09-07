import AffirmationModel from '../../../Models/affirmationSchema.js'
const getTodayString = () => new Date().toISOString().split('T')[0];
export const createAffirmation = async (userId, date, text) => {
  // Optional: Check if one already exists for this date and update it instead?
  // For now, we just create a new one.
  // Use the passed date, or fallback to today if not provided (though controller checks requirement)
  const dateStr = date || getTodayString();
  const affirmation = await AffirmationModel({
    user: userId,
    date: dateStr, // Ensure it's a date object
    text
  });
  await affirmation.save();
  return affirmation;
};

export const getAffirmationsByDate = async (userId, dateString) => {

  // 3. Find affirmations where date is >= Start AND < End
  return await AffirmationModel.find({
    user: userId,
    date: dateString
  });
};

export const getAllAffirmations = async (userId) => {
  return await AffirmationModel.find({ user: userId }).sort({ date: -1, createdAt: -1 });
};
export const deleteAffirmation = async (affirmationId, userId) => {
  const deleteAffirmId = await AffirmationModel.findOne({ _id: affirmationId, user: userId });
  if (!deleteAffirmId) {
    throw new Error("Affirmation not found or unauthorized");
  }
  return await AffirmationModel.deleteOne({ _id: affirmationId, user: userId });
};

export const updateAffirmation = async (affirmationId, userId, text, date) => {
  const updateFields = { text };
  if (date) updateFields.date = date;

  const updated = await AffirmationModel.findOneAndUpdate(
    { _id: affirmationId, user: userId },
    updateFields,
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new Error("Affirmation not found or unauthorized");
  }
  return updated;
};