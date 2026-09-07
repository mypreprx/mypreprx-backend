import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    default: "user"
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    default: ""
  }
  ,
  interestTopic:[{
    type:mongoose.Schema.Types.ObjectId,
    ref:'topic'
  }],
  motivationPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MotivationPost'
    }
  ],
  scriptingNotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScriptingNote'
    }
  ],
  NursingTips: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NursingTipsSchema'
  }],
  sessionToken: {
    type: String,
    default: null
  },
  attemptedQuestions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'quizQuestion'
  }],
  lifetimeCorrectAnswers: {
    type: Number,
    default: 0
  },
  lifetimeTotalQuestions: {
    type: Number,
    default: 0
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { timestamps: true });

const userModel = mongoose.model('User', userSchema);
export default userModel;
