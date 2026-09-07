import mongoose from 'mongoose';

const visualizationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  subtitle: {
    type: String,
    required: [true, 'Subtitle is required'],
    trim: true
  },
  duration: {
    type: String, 
    required: true
  },
  description: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String,
    required: [true, 'Video URL is required']
  },
  thumbnailUrl: {
    type: String,
    default: 'default_visualization.jpg' 
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true 
});

export default mongoose.model('Visualization', visualizationSchema);