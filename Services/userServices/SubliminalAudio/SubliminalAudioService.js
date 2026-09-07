import SubliminalAudioModel from "../../../Models/SubliminalAudioSchema.js"; // Ensure .js extension if using ES modules


// Get Random Audio
export const getRandomAudioService = async () => {
    const tracks = await SubliminalAudioModel.find({ isActive: true });
    if (!tracks || tracks.length === 0) {
        throw new Error("No active audio tracks found");
    }
    return tracks[Math.floor(Math.random() * tracks.length)];
};