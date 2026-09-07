import userModel from '../../../Models/userSchema.js';
import MotivationPostModel from '../../../Models/mondayPost.js';

export const sharePostService = async (postData, userId, imagePath) => {
  const { content } = postData;

  if ((!content || content.trim().length === 0) && !imagePath) {
    throw new Error("Post cannot be empty. Please provide text or upload an image.");
  }

  const newPost = await MotivationPostModel.create({
    author: userId,
    content,
    imageUrl: imagePath,
  });

  await userModel.findByIdAndUpdate(userId, {
    $push: { motivationPosts: newPost._id }
  });

  return newPost;
};

export const toggleLikeService = async (postId, userId) => {
  const post = await MotivationPostModel.findById(postId);

  if (!post) {
    throw new Error("Post not found");
  }

  const isLiked = post.likes.some(id => id.toString() === userId);

  if (isLiked) {
    post.likes = post.likes.filter(id => id.toString() !== userId);
  } else {
    post.likes.unshift(userId);
  }

  await post.save();

  return post.likes;
};

export const commentPostService = async (postId, userId, comment) => {
  if (!comment) {
    throw new Error("Comment text is required");
  }

  const post = await MotivationPostModel.findById(postId);
  if (!post) {
    throw new Error("Post not found");
  }

  const newComment = {
    user: userId,
    text: comment
  };

  post.comments.unshift(newComment);
  await post.save();

  return post.comments;
};

export const getAllPostsService = async () => {
  const posts = await MotivationPostModel.find()
    .sort({ createdAt: -1 })
    .populate('author', 'username email profilePicture')
    .populate('comments.user', 'username email profilePicture');

  return posts;
};
