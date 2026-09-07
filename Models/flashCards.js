import mongoose from 'mongoose';

const flashcardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    topic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic',
        required: true
    },
    questionText: {
        type: String,
        required: true
    },
    answerText: {
        type: String,
        required: true
    },
    rationale: {
        type: String,
    }
}, { timestamps: true });

export default mongoose.model('Flashcard', flashcardSchema);