import mongoose from "mongoose";

const SubliminalAudioSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  // UPDATED: No enum restriction. Admin can create any category.
  category: {
    type: String, 
    required: true,
    index: true, // Keep index for fast searching
    trim: true
  },
  audioUrl: {
    type: String,
    required: true, 
  },
  mimeType: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const SubliminalAudioModel = mongoose.model('SubliminalAudio', SubliminalAudioSchema);
export default SubliminalAudioModel;