import mongoose from 'mongoose';

const affirmationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model for PrepRx
    required: true
  },
  date: {
    type: Date, // Or String 'YYYY-MM-DD' if you want to avoid timezone headaches
    required: true
  },
  text: {
    type: String,
    required: [true, 'Affirmation text is required'],
    trim: true,
    maxlength: [500, 'Affirmation cannot exceed 500 characters']
  }
}, {
  timestamps: true 
});



const affirmationModel = mongoose.model('Affirmation', affirmationSchema);
export default affirmationModel;