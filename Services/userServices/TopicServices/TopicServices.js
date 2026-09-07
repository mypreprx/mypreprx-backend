import mongoose from 'mongoose';
import userModel from '../../../Models/userSchema.js';
import topicModel from '../../../Models/topicSchema.js';
import subtopicModel from '../../../Models/subTopicSchema.js';
import QuestionModel from '../../../Models/Question.js';

export const chooseGrowthZoneService = async (userId, topicIds) => {
  // 1. Ensure we have an array
  console.log("Received topicIds:", topicIds);
  
  const idArray = Array.isArray(topicIds) ? topicIds : [topicIds];

  // 2. Filter out anything empty
  const cleanIds = idArray.filter(id => id && id.length === 24);

  // 3. Update the User: $set replaces the entire array, allowing deselection
  const updatedUser = await userModel.findByIdAndUpdate(
    userId,
    { $set: { interestTopic: cleanIds } },
    { new: true }
  ).populate('interestTopic'); // Optional: returns the full topic data

  if (!updatedUser) {
    throw new Error("User not found");
  }

  return updatedUser.interestTopic;
};

export const getAllTopicsService = async () => {
  const topics = await topicModel.aggregate([
    {
      $lookup: {
        from: "subtopics",
        localField: "_id",
        foreignField: "topicId",
        as: "subtopicsData",
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        description: 1,
        lessonCount: { $size: "$subtopicsData" },
      },
    },
  ]);

  return topics;
};

import { createQuestionsForSubTopicService } from '../../adminServices/topicwiseQuestion/topicwiseQuestion.js';

export const getSubtopicsByTopicService = async (topicId) => {
  if (!mongoose.Types.ObjectId.isValid(topicId)) {
    throw new Error("Invalid Topic ID");
  }

  const topicDetails = await topicModel.findById(topicId);
  if (!topicDetails) {
    throw new Error("Topic not found");
  }

  const subtopicList = await subtopicModel.find({ topicId: topicId }).lean();
  
  // Fetch question counts and trigger JIT generation if empty
  const subtopicsWithCounts = await Promise.all(
    subtopicList.map(async (sub) => {
      let count = await QuestionModel.countDocuments({ subTopic: sub._id });
      
      // If count is 0, proactively attempt to generate questions
      if (count === 0) {
        try {
          console.log(`Proactively generating questions for subtopic: ${sub.title}`);
          const newQuestions = await createQuestionsForSubTopicService(sub._id);
          count = newQuestions.length;
        } catch (aiError) {
          console.error(`AI proactive generation failed for ${sub.title}:`, aiError.message);
        }
      }
      
      return { ...sub, questionCount: count };
    })
  );

  return { topic: topicDetails, subtopics: subtopicsWithCounts };
};
