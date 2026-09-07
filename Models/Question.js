import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
    subTopic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'subtopic'
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
    questionType: {
        type: String,
        enum: ['Single Choice', 'SATA'],
        default: 'Single Choice'
    },
    difficulty: {
        type: String,
        required: false
    },
    decoderFocus: {
        type: String,
        required: false
    },
    nclexConnection: {
        type: String,
        required: false
    },
    clinicalPediatricBreakdown: {
        type: String,
        required: false
    },
    clinicalMedSurgBreakdown: {
        type: String,
        required: false
    },
    managementOfCareBreakdown: {
        type: String,
        required: false
    },
    basicCareComfortBreakdown: {
        type: String,
        required: false
    },
    reductionOfRiskBreakdown: {
        type: String,
        required: false
    },
    physiologicalAdaptationBreakdown: {
        type: String,
        required: false
    },
    pharmacologicalParenteralBreakdown: {
        type: String,
        required: false
    },
    pharmacologyBreakdown: {
        type: String,
        required: false
    },
    safetyInfectionControlBreakdown: {
        type: String,
        required: false
    },
    psychosocialBreakdown: {
        type: String,
        required: false
    },
    healthPromotionBreakdown: {
        type: String,
        required: false
    },
    pedrxStrategy: {
        type: String,
        required: false
    },
    // --- NEW FIELDS FOR PREPRX AI ---
    rationale: { 
        type: String,
        required: false // Optional, prevents errors if AI misses it
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
    clinicalPearl: {
        type: String,
        required: false
    },
    clinicalPharmacologyBreakdown: {
        drugConcept: { type: String, required: false },
        whyItMatters: { type: String, required: false },
        nclexSafetyPriority: { type: String, required: false },
        patientTeaching: { type: String, required: false },
        labsToMonitor: { type: String, required: false },
        majorSideEffects: { type: String, required: false },
        toxicitySigns: { type: String, required: false },
        nursingActions: { type: String, required: false }
    }
})

const QuestionModel = mongoose.model('Question', QuestionSchema)
export default QuestionModel;