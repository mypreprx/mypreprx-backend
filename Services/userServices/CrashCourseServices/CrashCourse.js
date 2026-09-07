import topicModel from '../../../Models/topicSchema.js';
import crashCoursesModel from '../../../Models/CrashCourse.js';

export const getAllCrashCoursesService = async () => {
  const courses = await crashCoursesModel.find().populate('topicId');
  return courses;
};

export const getCrashCoursesByTopicService = async (topicName) => {
  if (!topicName) {
    throw new Error("Topic name is required");
  }

  const topic = await topicModel.findOne({ title: topicName });

  if (!topic) {
    throw new Error(`Topic '${topicName}' not found`);
  }

  const courses = await crashCoursesModel
    .find({ topicId: topic._id })
    .populate('topicId');

  return courses;
};
