import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Matches your User model name
        required: true
    },
    topicId:[ {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic',
        required: true
    }],
    // quizid:{
    //     type:mongoose.Schema.Types.ObjectId,
    //     ref:'Quiz'
    // },
    score: {
        type: Number,
        required: true
    },
    totalQuestions: {
        type: Number,
        required: true
    },
    percentage: {
        type: Number, // Useful for quick analytics (e.g., "You got 80%!")
        required: true
    },
    // Seconds spent on this attempt (sum for multi-Q; per-question for drill logs)
    durationSeconds: {
        type: Number,
        default: null,
    },
   details: [{
             questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'quizQuestion' },
             userAnswer: String,
             isCorrect: Boolean
         }],
    
}, { timestamps: true });

const QuizAttemptModel = mongoose.model('QuizAttempt', quizAttemptSchema);
export default QuizAttemptModel;