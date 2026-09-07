import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema({
    selectedTopic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic'
    },
    question: {
        type: String,
        required: true
    },
    option: [{ type: String }],
    correctAnswer: {
        type: String,
        required: true
    },
    difficultyLevel: {
        type: String,
        // Ensure this matches what you send from the frontend (Easy, Moderate, Hard)
        enum: ['Easy', 'Moderate', 'Hard'], 
        required: true
    },
    questionType: {
        type: String,
        enum: ['Single Choice', 'SATA'],
        default: 'Single Choice'
    },
    // --- NEW FIELDS FOR PREPRX AI ---
    rationale: { 
        type: String,
        required: false // Optional, prevents errors if AI misses it
    },
    keyTakeaway: { 
        type: String, 
        required: false 
    },
    strategyTip: { 
        type: String, 
        required: false 
    },
    category: { 
        type: String, 
        required: false 
    },
    whyIncorrect: {
        type: String,
        required: false
    },
    memoryTrick: {
        type: String,
        required: false
    },
    nclexTrap: {
        type: String,
        required: false
    },
    primaryFramework: {
        type: String,
        required: false
    },
    secondaryFramework: {
        type: String,
        required: false
    },
    optionEvaluations: [{
        optionText: String,
        isTrue: Boolean,
        explanation: String
    }],
    safetyPearl: { type: String, required: false },
    clinicalPearl: { type: String, required: false },
    clinicalJudgmentDomain: { type: String, required: false },
    topic: { type: String, required: false },
    subtopic: { type: String, required: false },
    clientNeedsCategory: { type: String, required: false },
    estimatedTime: { type: String, required: false },
    clinicalJudgmentBreakdown: {
        assessment: String,
        cueRecognition: String,
        cueAnalysis: String,
        priorityProblem: String,
        nursingIntervention: String,
        medicationConsiderations: String,
        outcomeEvaluation: String
    }
    // --------------------------------
})

const quizQuestionModel = mongoose.model('quizQuestion', quizQuestionSchema)
export default quizQuestionModel