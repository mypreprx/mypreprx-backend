import mongoose from 'mongoose';

const questionFlagSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'quizQuestion',
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    issue: {
        type: String,
        required: true,
        trim: true
    },
    trigger: {
        type: String,
        default: 'User Report',
        trim: true
    },
    flags: {
        type: Number,
        default: 1,
        min: 1
    },
    status: {
        type: String,
        enum: ['Review Required', 'Flagged by Users', 'Under Inspection', 'Critical Fix'],
        default: 'Review Required'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: false
    },
    note: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const questionFlagModel = mongoose.model('QuestionFlag', questionFlagSchema);
export default questionFlagModel;
