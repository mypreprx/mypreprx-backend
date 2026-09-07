import mongoose from "mongoose";

const NursingTipSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Optional: The user might just send text
  content: {
    type: String,
    trim: true
  },
  topicId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'topic'
  },
  // Likes: Array of User IDs
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],

  // Comments: Array of objects
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const  NursingTipsModel= mongoose.model('NursingTipSchema', NursingTipSchema);
export default NursingTipsModel;