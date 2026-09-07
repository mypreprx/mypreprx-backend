import mongoose from "mongoose";

const moodTrackerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // We store the date as a string "YYYY-MM-DD" to easily enforce the "once per day" rule
  date: {
    type: String, 
    required: true
  },
  // 0 = Relaxed, 100 = Stressed (matches your slider)
  moodValue: { 
    type: Number,   // Ensure this is Number, NOT String
    required: true,
    min: 0,         // Optional: limits matching your slider
    max: 100        // Optional: limits matching your slider
  },
  // Optional: In case they want to add a quick note about why they feel that way
  label:{ type: String,
     required: true,
    enum:['Relaxed','Neutral','Stressed'] }
}, { timestamps: true });

// THIS IS THE KEY: Prevents duplicate entries for the same user on the same date
moodTrackerSchema.index({ userId: 1, date: 1 }, { unique: true });

const MoodTrackerModel = mongoose.model('MoodTracker', moodTrackerSchema);
export default MoodTrackerModel;