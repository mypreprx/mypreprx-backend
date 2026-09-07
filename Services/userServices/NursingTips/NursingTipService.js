import NursingTipsModel from '../../../Models/NursingTipsSchema.js'; 
import userModel from '../../../Models/userSchema.js';
// 1. Create a New Tip (Share Post)
export const createTipService = async (userId, data) => {
  const { content, topicId } = data;

  const newTip = await NursingTipsModel.create({
    author: userId,      // Matches your schema's 'author' field
    content: content,
    topicId: topicId,    // Stores the reference ID to the Topic model
    likes: [],
    comments: []
  });
    await userModel.findByIdAndUpdate(userId,{$push:{NursingTips:newTip._id}})
  // Populate author and topic immediately for the UI
  return await newTip.populate([
    { path: 'author', select: 'username role' }, 
    { path: 'topicId', select: 'title' }
  ]);
};

// 2. Toggle Like (Add or Remove)
export const NursingtoggleLikeService = async (userId, tipId) => {
  const tip = await NursingTipsModel.findById(tipId);
  if (!tip) throw new Error("Post not found");

  // Check if user has already liked the post
  // We compare string versions of ObjectIds to be safe
  const index = tip.likes.findIndex(id => id.toString() === userId.toString());

  if (index === -1) {
    // Not liked yet -> Add Like
    tip.likes.push(userId);
  } else {
    // Already liked -> Remove Like
    tip.likes.splice(index, 1);
  }

  await tip.save();
  return tip.likes.length; // Return updated count
};

// 3. Add a Comment
export const addCommentService = async (userId, tipId, text) => {
  const tip = await NursingTipsModel.findById(tipId);
  if (!tip) throw new Error("Post not found");

  const newComment = {
    user: userId,
    text: text,
    createdAt: new Date()
  };

  tip.comments.push(newComment);
  await tip.save();

  // Return the updated tip with populated comment authors
  return await tip.populate({
    path: 'comments.user',
    select: 'name avatar'
  });
};

// 4. Get All Posts (With Topic Filter)
export const getAllTipsService = async (topicIdFilter) => {
  let query = {};

  // If a specific topic ID is provided (not 'All'), filter by it
  if (topicIdFilter && topicIdFilter !== 'All') {
    query.topicId = topicIdFilter;
  }

  const tips = await NursingTipsModel.find(query)
    .sort({ createdAt: -1 }) // Newest first
    .populate('author', 'username role') // Get post author details
    .populate('topicId', 'title')           // Get the Topic Name (e.g. "Pharmacology")
    .populate('comments.user', 'user'); // Get comment author details

  return tips;
};

export const deleteTipService = async (userId, tipId) => {
  // 1. Find the tip
  const tip = await NursingTipsModel.findById(tipId);
  console.log(tip);
  
  if (!tip) {
    throw new Error("Tip not found");
  }

  // 2. AUTHORIZATION CHECK: strict check to ensure ownership
  // We convert both IDs to strings to ensure accurate comparison
  if (tip.author.toString() !== userId.toString()) {
    throw new Error("You are not authorized to delete this post");
  }

  // 3. Delete the Tip from NursingTips collection
  await NursingTipsModel.findByIdAndDelete(tipId);

  // 4. CLEANUP: Remove the reference from the User's "NursingTips" array
  await userModel.findByIdAndUpdate(userId, { 
    $pull: { NursingTips: tipId } 
  });

  return { message: "Tip deleted successfully" };
};