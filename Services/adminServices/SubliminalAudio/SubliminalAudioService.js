import SubliminalAudioModel from "../../../Models/SubliminalAudioSchema.js"; // Ensure .js extension if using ES modules

// 1. Create (Upload) Logic
export const createAudioEntry = async (data) => {
  // Create a new document in MongoDB
  const newAudio = await SubliminalAudioModel.create(data);
  return await newAudio.save();
};

// 2. Fetch Logic (For the User)
export const getAudioByCategory = async (category) => {
  // Find all active tracks matching the category
  const tracks = await SubliminalAudioModel.find({
    category: category,
    isActive: true
  });

  if (!tracks || tracks.length === 0) {
    throw new Error(`No audio found for category: ${category}`);
  }

  // OPTIONAL: Return a random track from the list so the user doesn't hear the same one every time
  const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

  return randomTrack;
};

// 3. Admin: Fetch All
export const getAllAudiosService = async () => {
  return await SubliminalAudioModel.find({}).sort({ createdAt: -1 });
};

// 4. Admin: Update
export const updateAudioService = async (id, data) => {
  return await SubliminalAudioModel.findByIdAndUpdate(id, data, { new: true });
};

// 5. Admin: Delete
export const deleteAudioService = async (id) => {
  return await SubliminalAudioModel.findByIdAndDelete(id);
};

// 6. Common: Get All Categories
export const getAllCategoriesService = async () => {
  return await SubliminalAudioModel.distinct('category', { isActive: true });
};
