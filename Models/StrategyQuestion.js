import mongoose from 'mongoose';

const strategyQuestionSchema = new mongoose.Schema({
    strategyTab: {
        type: String,
        required: true,
        enum: [
            'Priority Framework', 
            'Elimination Techniques', 
            'NCLEX Language Decoder', 
            'SATA Boot Camp', 
            'Critical Thinking Drills', 
            'Priority Patients', 
            'Pharm Shortcuts'
        ]
    },
    subCategory: {
        type: String, // e.g., 'ABC', 'Maslow', 'Safety First' for Priority Framework
        required: true
    },
    question: {
        type: String,
        required: true
    },
    options: [{ type: String }],
    correctAnswers: [{ type: String }], // Array to support SATA
    difficultyLevel: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced', 'NGN Case Study', 'Expert', 'Moderate', 'Hard', 'Moderate-Hard', 'Advanced Clinical Judgment'],
        default: 'Intermediate'
    },
    rationale: { 
        type: String,
        required: true 
    },
    whyIncorrect: {
        type: String
    },
    whySelectedCorrect: {
        type: String
    },
    memoryTrick: {
        type: String
    },
    nclexTrap: {
        type: String
    },
    clinicalPearl: {
        type: String
    },
    clinicalPharmacologyBreakdown: {
        type: String
    },
    nclexConnection: {
        type: String
    },
    preprxTestTakingStrategy: {
        type: String
    },
    authoritativeReferenceValidation: {
        type: String
    },
    primaryFramework: {
        type: String
    },
    secondaryFramework: {
        type: String
    },
    // Specific for SATA evaluation logic
    optionEvaluations: [{
        optionText: String,
        isTrue: Boolean,
        explanation: String
    }],
    // Specific for Critical Thinking / Priority
    cues: [{ type: String }],
    priorityRanking: [{ type: String }]
}, { timestamps: true });

const StrategyQuestionModel = mongoose.model('StrategyQuestion', strategyQuestionSchema);
export default StrategyQuestionModel;
