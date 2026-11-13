import mongoose from "mongoose";

/**
 * One document per user per calendar day of answering questions.
 * Used for Progress / Treatment Plan study streak + streak badges.
 */
const studyActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // YYYY-MM-DD (UTC) — same convention as MoodTracker
    date: {
      type: String,
      required: true,
    },
    sources: {
      type: [String],
      default: [],
    },
    activityCount: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

studyActivitySchema.index({ userId: 1, date: 1 }, { unique: true });

const StudyActivityModel = mongoose.model("StudyActivity", studyActivitySchema);
export default StudyActivityModel;
