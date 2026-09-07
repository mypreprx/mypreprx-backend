import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { 
    type: String, 
    enum: ['user', 'Admin','assistant', 'system'], 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const ChatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model
    required: true,
    index: true
  },
  title: {
    type: String,
    default: "New Chat"
  },
  messages: [MessageSchema]   // OR Stores the conversation array message:{
//   role: { 
//     type: String, 
//     enum: ['user', 'Admin','assistant', 'system'], 
//     required: true 
//   },
//   content: { 
//     type: String, 
//     required: true 
//   },
//   createdAt: { 
//     type: Date, 
//     default: Date.now 
//   }
// }
}, { timestamps: true });

// Prevent OverwriteModelError
const ChatSessionModel =  mongoose.model('ChatSession', ChatSessionSchema);

export default ChatSessionModel;