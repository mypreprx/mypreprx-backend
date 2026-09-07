import mongoose from 'mongoose';

const pirPracticeSchema = new mongoose.Schema({
  subTopic: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'subtopic', 
    required: true 
  },
  title: String,
  category: {
    type: String,
    enum: ['priority-practice', 'behavioral-health'],
    default: 'priority-practice'
  },
  difficulty: String,
  
  // The Patient Chart Data
  patientChart: {
    age: Number,
    gender: String,
    chiefComplaint: String,
    history: String,
    homeMeds: String,
    vitals: String,
    assessment: String,
    orders: String,
    labs: String,
    providerImpression: String
  },
   scenarioNarrative: String,
  // The 6 Questions
  questions: [{
    step: Number,
    cjmStage: String, // e.g., "Recognize Cues"
    questionType: String, // e.g., "multiple_choice", "highlight"
    questionText: String,
    options: [String],
    correctAnswer: String, // Or [String] if you support SATA
    rationale: String,
    distractorExplanation: String,
    keyTakeaway: String,
    strategyTip: String
  }]
}, { timestamps: true });

const pirPracticeSchemaModel =  mongoose.model('PirPractice', pirPracticeSchema);
export default pirPracticeSchemaModel;