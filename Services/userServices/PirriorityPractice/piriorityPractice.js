import pirPracticeSchemaModel from '../../../Models/piriorityPracticeSchema.js'; // Adju
export const getAllPriorityPracticeService = async () => {
  // 1. Await the find and populate the 'subtopic' field
  // 2. Ensure you return the result so the controller can use it
  const allPractices = await pirPracticeSchemaModel
    .find()
    .populate('subTopic'); 

  return allPractices;
};
export const getAllPriorityPracticeForSubTopicService = async (subtopicId)=>{
  const practiceforSubtopic = await pirPracticeSchemaModel.find({subTopic:subtopicId}).populate('subTopic');
  return practiceforSubtopic;
}