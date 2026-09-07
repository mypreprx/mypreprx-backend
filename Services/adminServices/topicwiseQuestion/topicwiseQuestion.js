import QuestionModel from '../../../Models/Question.js'
import SubTopicModel from '../../../Models/subTopicSchema.js'// Assuming you have this
import { generateQuestionsAI } from '../../../utilities/subTopic&Question.js';

export const createQuestionsForSubTopicService = async (subTopicId) => {
  // 1. Fetch the SubTopic to get the actual names for the prompt
  const subTopicDoc = await SubTopicModel.findById(subTopicId).populate('topicId');
  
  if (!subTopicDoc) {
    throw new Error("SubTopic not found");
  }

  const subTopicName = subTopicDoc.title;
  // If parentTopic is populated, use its name, otherwise default to subtopic name
  const mainTopicName = subTopicDoc.topicId ? subTopicDoc.topicId.title : subTopicName;

  // 2. Call the AI Utility
  const rawQuestions = await generateQuestionsAI(subTopicName, mainTopicName);

  // 3. Format data to match your Mongoose Schema exactly
  const questionsToSave = rawQuestions.map((q) => ({
    subTopic: subTopicId, // Link the new questions to the ID
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
    optionEvaluations: q.optionEvaluations
  }));

  // 4. Bulk Insert into Database
  const savedQuestions = await QuestionModel.insertMany(questionsToSave);
  
  return savedQuestions;
};
export const updateQuestionService = async (questionId, updateData) => {
  // 1. Find the question and update it
  // { new: true } ensures the function returns the UPDATED document, not the old one.
  const updatedQuestion = await QuestionModel.findByIdAndUpdate(
    questionId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedQuestion) {
    throw new Error("Question not found");
  }

  return updatedQuestion;
};
export const deleteQuestionService = async (questionId) => {
  const deletedQuestion = await QuestionModel.findByIdAndDelete(questionId);

  if (!deletedQuestion) {
    throw new Error("Question not found");
  }

  return { message: "Question deleted successfully", deletedId: questionId };
};


export const deleteAllQuestionsForSubTopic = async (subTopicId) => {
  const result = await QuestionModel.deleteMany({ subTopic: subTopicId });
  return { message: `Deleted ${result.deletedCount} questions for subtopic.` };
};


export const getSpecificQuestionService = async (questionId) => {
    const question= await QuestionModel.findById(questionId);
    if(!question){
       throw new Error("Question not found");
    }
    return question;
};

export const getAllQuestionforSubTopicsService = async (subtopicId) => {
    const questions= await QuestionModel.find({ subTopic: subtopicId });
    if(questions.length === 0){
       throw new Error("No questions found for this subtopic");
    }
    return questions;
};