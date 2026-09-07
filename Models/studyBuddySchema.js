// Schemas/studyBuddySchema.js
import mongoose from 'mongoose';

const studyBuddySchema = new mongoose.Schema({
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Matches "Your Goal" input
    topic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic',
        required: true // e.g., "Need a partner to help practice with pharmacology"
    }, goal: {
        type: String,
        required: true // e.g., "Need a partner to help practice with pharmacology"
    },
    // Matches "Your Availability" input
    availableTime: {
        type: String,
        required: true // e.g., "8:00 pm"
    },
    status: {
        type: String,
        enum: ['Open', 'Closed'],
        default: 'Open'
    },
    // Stores replies for the "1 response" counter
    replies: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        message: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const StudyBuddyModel = mongoose.model('StudyBuddy', studyBuddySchema);
export default StudyBuddyModel;