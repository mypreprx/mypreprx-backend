import QuestionModel from "../../../Models/Question.js";
import subtopicModel from "../../../Models/subTopicSchema.js";
import { createQuestionsForSubTopicService } from "../../adminServices/topicwiseQuestion/topicwiseQuestion.js";

export const getQuestionsBySubtopicService = async (subtopicId) => {
  if (!subtopicId) {
    throw new Error("Subtopic ID is required");
  }

  let questions = await QuestionModel.find({ subTopic: subtopicId });
  
  // JIT Generation: If no questions exist, generate them using AI
  if (questions.length === 0) {
    console.log(`No questions found for subtopic ${subtopicId}. Triggering JIT AI generation.`);
    questions = await createQuestionsForSubTopicService(subtopicId);
  }

  // Format to match the quiz format expected by the frontend
  return questions.map(q => formatQuestion(q, null));
};

const formatQuestion = (q, subtopicTitle) => ({
  _id: q._id,
  question: q.question,
  option: q.option,
  correctAnswer: q.correctAnswer,
  rationale: q.rationale,
  whyIncorrect: q.whyIncorrect,
  memoryTrick: q.memoryTrick,
  nclexTrap: q.nclexTrap,
  primaryFramework: q.primaryFramework,
  secondaryFramework: q.secondaryFramework,
  clinicalPearl: q.clinicalPearl,
  clinicalPharmacologyBreakdown: q.clinicalPharmacologyBreakdown,
  optionEvaluations: q.optionEvaluations,
  subtopicTitle,
  difficulty: q.difficulty,
  decoderFocus: q.decoderFocus,
  nclexConnection: q.nclexConnection,
  clinicalPediatricBreakdown: q.clinicalPediatricBreakdown,
  clinicalMedSurgBreakdown: q.clinicalMedSurgBreakdown,
  managementOfCareBreakdown: q.managementOfCareBreakdown,
  basicCareComfortBreakdown: q.basicCareComfortBreakdown,
  reductionOfRiskBreakdown: q.reductionOfRiskBreakdown,
  physiologicalAdaptationBreakdown: q.physiologicalAdaptationBreakdown,
  pharmacologicalParenteralBreakdown: q.pharmacologicalParenteralBreakdown,
  pharmacologyBreakdown: q.pharmacologyBreakdown,
  safetyInfectionControlBreakdown: q.safetyInfectionControlBreakdown,
  psychosocialBreakdown: q.psychosocialBreakdown,
  healthPromotionBreakdown: q.healthPromotionBreakdown,
  pedrxStrategy: q.pedrxStrategy
});

export const getAllQuestionsByTopicService = async (topicId) => {
  if (!topicId) {
    throw new Error("Topic ID is required");
  }

  const subtopics = await subtopicModel.find({ topicId }).lean();
  if (subtopics.length === 0) return [];

  const subtopicIds = subtopics.map((s) => s._id);
  const titleById = {};
  subtopics.forEach((s) => { titleById[String(s._id)] = s.title; });

  const questions = await QuestionModel.find({ subTopic: { $in: subtopicIds } });
  return questions.map((q) => formatQuestion(q, titleById[String(q.subTopic)] || null));
};
