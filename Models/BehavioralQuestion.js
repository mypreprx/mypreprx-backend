import mongoose from 'mongoose';

const behavioralQuestionSchema = new mongoose.Schema({
    topic: {
        type: String,
        required: true
    }, // e.g. "Case Studies", "Psych Medication", "Cultural Sensitivity", "Therapeutic Communication"
    caseNumber: { type: Number },
    caseTitle: { type: String },
    client: { type: String },
    setting: { type: String },
    primaryConcern: { type: String },
    chiefConcern: { type: String },
    historyContext: { type: String },
    initialNursingFocus: { type: String },
    clientNeeds: { type: String },
    initialChart: { type: String },
    psychiatricDiagnosis: { type: String },
    medicationFocus: { type: String },
    presentingChange: { type: String },
    clinicalConcern: { type: String },
    unfoldingChart: { type: String },
    culturalContextCue: { type: String },
    assessment: { type: String },
    plan: { type: String },
    nclexFocus: { type: String },
    age: { type: String },
    gender: { type: String },
    clinicalScenario: {
        type: String,
        required: true
    },
    questions: [
        {
            ncjmmStep: { type: String },
            currentFormat: { type: String },
            difficulty: { type: String },
            questionText: { type: String },
            options: [String],
            correctAnswers: [String],
            rationale: { type: String },
            whyIncorrect: { type: String },
            memoryTrick: { type: String },
            nclexTrap: { type: String },
            clinicalPearl: { type: String },
            clinicalBreakdown: { type: String },
            nclexConnection: { type: String },
            preprxStrategy: { type: String }
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('BehavioralQuestion', behavioralQuestionSchema);
