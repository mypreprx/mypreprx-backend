import SubTopicModel from '../../../Models/subTopicSchema.js' // Adjust path as needed
import pirPracticeSchemaModel from '../../../Models/piriorityPracticeSchema.js'; // Adjust path as needed
import { generateCaseStudyAI } from '../../../utilities/generatePracticeQuestion.js'; // Adjust path/import as needed

export const createPriorityPracticeService = async (subTopicId) => {
  // 1. Get Topic Names
  const subTopicDoc = await SubTopicModel.findById(subTopicId).populate('topicId');
  
  if (!subTopicDoc) {
    throw new Error("Subtopic not found");
  }
   console.log(`the subtopic data ${subTopicDoc}`);
   
  const subName = subTopicDoc.title;
  // Fallback to "Nursing" if topicId is missing
  const mainName = subTopicDoc.topicId ? subTopicDoc.topicId.title : "Nursing";
 
  console.log(`The Subtopic : ${subName} and topic name : ${mainName}`);
  
  // 2. Generate AI Data
  // Assuming generateCaseStudyAI returns an object with { title, patientChart, questions }
  const caseStudyData = await generateCaseStudyAI(subName, mainName);

  // 3. Create and Save the Case Study
  const newCaseStudy = await pirPracticeSchemaModel.create({
    subTopic: subTopicId,
    ...caseStudyData 
  });

  await newCaseStudy.save();

  return newCaseStudy;
};

export const updatePriorityPracticeService = async (practiceId, updateData) => {
  // We use { new: true } to return the document AFTER the update is applied
  // We use { runValidators: true } to ensure the new data follows your schema rules
  const updatedPractice = await pirPracticeSchemaModel.findByIdAndUpdate(
    practiceId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedPractice) {
    throw new Error("Practice Case Study not found");
  }

  return updatedPractice;
};


// Service to Delete a Practice Case Study
export const deletePriorityPracticeService = async (practiceId) => {
  const deletedPractice = await pirPracticeSchemaModel.findByIdAndDelete(practiceId);

  if (!deletedPractice) {
    throw new Error("Practice Case Study not found");
  }

  return deletedPractice;
};


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
