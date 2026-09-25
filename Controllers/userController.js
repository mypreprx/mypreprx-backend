import {
  registerUserService,
  loginUserService,
  logoutUserService,
  getUserHomeService,
  googleAuthService
} from '../Services/userServices/RegisterLoginServices/registerLogin.js';

import { updateProfileService } from '../Services/userServices/ProfileServices/profile.js';

import {
  chooseGrowthZoneService,
  getAllTopicsService,
  getSubtopicsByTopicService
} from '../Services/userServices/TopicServices/TopicServices.js';

import { 
    createCustomQuizService, 
    submitQuizService 
} from '../Services/userServices/QuizServices/QuizServices.js';
import {
    startNclexSimulationService,
    submitNclexAnswerService
} from '../Services/userServices/QuizServices/nclexServices.js';

import { getQuestionsBySubtopicService, getAllQuestionsByTopicService } from '../Services/userServices/QuizServices/QuestionServices.js';
import { getStrategyQuestionsService, generateStrategyBatch, getAbcBankQuestions, getStrategyBankQuestions } from '../Services/adminServices/StrategyServices/StrategyServices.js';

import {
  getAllCrashCoursesService,
  getCrashCoursesByTopicService
} from '../Services/userServices/CrashCourseServices/CrashCourse.js';

import {
  getAllVisualizationService
} from '../Services/userServices/Visualizations/visualization.js'


import {
  sharePostService,
  toggleLikeService,
  commentPostService,
  getAllPostsService
} from '../Services/userServices/SocialServices/SocialServices.js';

import {
  createNoteService,
  updateNoteService,
  deleteNoteService,
  getAllNotesService
} from '../Services/userServices/NoteServices/NoteServices.js';

import {
  createStudyRequestService,
  getAllStudyRequestsService,
  replyToStudyRequestService,
  getChatHistoryService
} from '../Services/userServices/StudyBuddyServices/StudyBuddyServices.js';

import {
  processUserMessageService,
  getUserChatHistory,
  getSessionDetails
} from '../Services/userServices/AIServices/MichellchatBotServices.js'

import {
  createTipService,
  NursingtoggleLikeService,
  addCommentService,
  getAllTipsService,
  deleteTipService
} from '../Services/userServices/NursingTips/NursingTipService.js'

import {
  createAffirmation,
  getAffirmationsByDate,
  getAllAffirmations,
  deleteAffirmation,
  updateAffirmation
} from '../Services/userServices/AffirmationServices/AffirmationServices.js'

import { logDailyMood, getStreakAndHistory } from "../Services/userServices/DailyFeelingServices/DailyFeelingCheckin.js";
import { getDashboardAnalyticsService } from "../Services/userServices/Analytics/Analytics.js"; // Make sure path is correct

import { getDailyAIAffirmationService } from "../Services/userServices/AffirmationServices/DailyAIAffirmation.js";

import { getRandomAudioService } from '../Services/userServices/SubliminalAudio/SubliminalAudioService.js'

import { getAllPiriorityPracticeService } from '../Services/userServices/PiriorityPracticeService/PirPracticeService.js';


import {
  getAllPriorityPracticeService,
  getAllPriorityPracticeForSubTopicService
} from '../Services/userServices/PirriorityPractice/piriorityPractice.js'

import {
  createFlashcard,
  getUserFlashcards,
  deleteFlashcard
} from '../Services/userServices/FlashCardServices/FlashCardService.js'
// ==========================================
// AUTHENTICATION CONTROLLERS
// ==========================================

export const registerUser = async (req, res) => {
  try {
    const newUser = await registerUserService(req.body);
    res.status(201).json({
      message: "User Registered Successfully",
      newUser
    });
  } catch (error) {
    res.status(error.message.includes("Already exists") ? 400 : 500).json({
      message: error.message
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { token, user } = await loginUserService(req.body);
    res.cookie('Token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    res.status(200).json({
      message: "Login Successfully",
      token
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 400).json({
      message: error.message
    });
  }
};

export const logout = async (req, res) => {
  try {
    await logoutUserService(req.user?.id);
    res.clearCookie('Token');
    res.status(201).json({
      message: 'Token is cleared from cookies'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const googleLogin = async (req, res) => {
  try {
    console.log('google Login controller called ')
    const { token: googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({ message: "Google Token is required" });
    }

    const { token, user, isNewUser } = await googleAuthService(googleToken);

    // Set the cookie just like your standard login
    res.cookie('Token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Google Login Successful",
      token,
      user,
      isNewUser
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    console.log('google Login controller called ')
    res.status(500).json({ message: "Google Authentication Failed", error: error.message });
  }
};

export const home = async (req, res) => {
  try {
    const user = await getUserHomeService(req.user.id);
    res.status(200).json({
      message: "Welcome to Home",
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDailyAffirmation = async (req, res) => {
  try {
    // Never let a browser/HTTP cache serve a stale daily affirmation
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const affirmation = await getDailyAIAffirmationService();
    res.status(200).json({
      success: true,
      data: affirmation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;
    const file = req.file;

    const updatedUser = await updateProfileService(userId, updateData, file);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==========================================
// TOPIC & INTEREST CONTROLLERS
// ==========================================

export const choosurGrowthZone = async (req, res) => {
  try {
    // Look at your Store: it sends { titles: selectedIds }
    const { titles } = req.body;

    if (!titles) {
      return res.status(400).json({ message: "Titles/IDs are required" });
    }

    // Pass the IDs to the service
    const topics = await chooseGrowthZoneService(req.user.id, titles);

    return res.status(200).json({
      message: "Success",
      topics: topics
    });
  } catch (error) {
    console.error("Backend Error:", error); // This shows in your terminal
    return res.status(500).json({ message: error.message });
  }
};

export const getStrategyQuestions = async (req, res) => {
  try {
    const { strategyTab, limit } = req.query;
    const questions = await getStrategyQuestionsService(strategyTab, limit, req.user.id);

    res.status(200).json({
      success: true,
      message: "Strategy questions fetched successfully",
      data: questions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching strategy questions",
      error: error.message,
    });
  }
};

export const getAllTopics = async (req, res) => {
  try {
    const topics = await getAllTopicsService();
    res.status(200).json({
      success: true,
      message: "All topics fetched successfully",
      data: topics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching topics",
      error: error.message,
    });
  }
};

export const getSubtopicsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const data = await getSubtopicsByTopicService(topicId);
    res.status(200).json({
      success: true,
      message: "Subtopics fetched successfully",
      data: data,
    });
  } catch (error) {
    res.status(error.message.includes("Invalid") ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// QUIZ CONTROLLERS
// ==========================================

export const CreateCustomQuiz = async (req, res) => {
  try {
    const result = await createCustomQuizService(req.body, req.user.id);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(error.message.includes("fill all") ? 400 : 500).json({
      message: error.message
    });
  }
};

export const submitQuiz = async (req, res) => {
  try {
    const { answers } = req.body;
    const data = await submitQuizService(answers, req.user.id);
    res.status(200).json({
      success: true,
      message: "Quiz submitted successfully",
      data: data
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

export const getQuestionsBySubtopic = async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const questions = await getQuestionsBySubtopicService(subtopicId);
    res.status(200).json({
      success: true,
      questions: questions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllQuestionsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const questions = await getAllQuestionsByTopicService(topicId);
    res.status(200).json({
      success: true,
      questions: questions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==========================================
// CRASH COURSE CONTROLLERS
// ==========================================

export const getAllCrashCourses = async (req, res) => {
  try {
    const courses = await getAllCrashCoursesService();
    res.status(200).json({
      success: true,
      message: "All crash courses fetched successfully",
      count: courses.length,
      data: courses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching crash courses",
      error: error.message,
    });
  }
};

export const getCrashCoursesByTopic = async (req, res) => {
  try {
    const { topicName } = req.params;
    const courses = await getCrashCoursesByTopicService(topicName);
    res.status(200).json({
      success: true,
      message: `Found ${courses.length} crash courses`,
      data: courses
    });
  } catch (error) {
    res.status(error.message.includes("required") ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};


// ==========================================
// VISUALIZATION ROOM
// =========================================
export const getAllVisualization = async (req, res) => {
  try {
    const visuals = await getAllVisualizationService();
    res.status(200).json({
      success: true,
      count: visuals.length,
      data: visuals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};



// ==========================================
// POST & SOCIAL CONTROLLERS
// ==========================================

export const sharePost = async (req, res) => {
  try {
    console.log('Share Poste Triggers')
    const { content } = req.body;
    const imagePath = req.file ? req.file.path : null;

    const post = await sharePostService({ content }, req.user.id, imagePath);
    res.status(201).json({
      success: true,
      message: `New Post Created by User ${req.user.id}`,
      post: post
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const toggleLike = async (req, res) => {
  try {
    const { postid } = req.params;
    const likes = await toggleLikeService(postid, req.user.id);
    res.status(201).json({ likes });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      msg: error.message
    });
  }
};

export const commentPost = async (req, res) => {
  try {
    const { postid } = req.params;
    const { comment } = req.body;

    const comments = await commentPostService(postid, req.user.id, comment);
    res.status(200).json({
      success: true,
      comments: comments
    });
  } catch (error) {
    res.status(error.message.includes("required") ? 400 : 404).json({
      msg: error.message
    });
  }
};

export const getAllPosts = async (req, res) => {
  try {
    const posts = await getAllPostsService();
    res.status(200).json({
      success: true,
      count: posts.length,
      posts: posts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// ==========================================
// NOTE & SCRIPT CONTROLLERS
// ==========================================

export const createNote = async (req, res) => {
  try {
    const note = await createNoteService(req.user.id, req.body);
    res.status(201).json({
      success: true,
      note: note
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateNote = async (req, res) => {
  try {
    const { noteid } = req.params;
    const updatedNote = await updateNoteService(req.user.id, noteid, req.body);
    res.status(200).json({
      success: true,
      message: "Note updated successfully",
      note: updatedNote
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const { noteid } = req.params;
    await deleteNoteService(req.user.id, noteid);
    res.status(200).json({
      success: true,
      message: "Note deleted successfully"
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
};

export const getallNotes = async (req, res) => {
  try {
    const notes = await getAllNotesService(req.user.id);
    res.status(200).json({
      success: true,
      count: notes.length,
      notes: notes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==========================================
// STUDY BUDDY CONTROLLERS
// ==========================================

export const createStudyRequest = async (req, res) => {
  try {
    const newRequest = await createStudyRequestService(req.user.id, req.body);

    // Socket.IO emission
    const io = req.app.get('io');
    io.emit('new_study_request', {
      _id: newRequest._id,
      creatorName: newRequest.creator.username,
      topicName: newRequest.topic.title,
      goal: newRequest.goal,
      time: newRequest.availableTime,
      responseCount: 0,
      isCreator: false
    });

    res.status(201).json({
      success: true,
      message: "Study request posted successfully!",
      data: newRequest
    });
  } catch (error) {
    res.status(error.message.includes("required") ? 400 : 500).json({
      message: error.message
    });
  }
};

// export const getAllStudyRequests = async (req, res) => {
//   try {
//     const { filterTopicId } = req.query;
//     const requests = await getAllStudyRequestsService(filterTopicId);

//     const formattedData = requests.map(Data => ({
//       _id: Data._id,
//       creatorName: Data.creator.username,
//       topicName: Data.topic ? Data.topic.title : "General",
//       topicId: Data.topic ? Data.topic._id : null,
//       goal: Data.goal,
//       time: Data.availableTime,
//       replies: Data.replies.length,
//       responseCount: Data.replies.length,
//       isCreator: Data.creator._id.toString() === req.user.id
//     }));

//     res.status(200).json({
//       success: true,
//       data: formattedData,
//       totalData: formattedData.length
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: error.message
//     });
//   }
// };

export const getAllStudyRequests = async (req, res) => {
  try {
    const { filterTopicId, requestId } = req.query;
    const requests = await getAllStudyRequestsService(filterTopicId);

    // If a specific requestId is requested, return full reply data
    if (requestId) {
      const singleRequest = requests.find(r => r._id.toString() === requestId);
      if (singleRequest) {
        return res.status(200).json({
          success: true,
          data: singleRequest
        });
      }
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    const formattedData = requests.map(Data => ({
      _id: Data._id,
      creator: Data.creator,
      creatorName: Data.creator.username,
      topicName: Data.topic ? Data.topic.title : "General",
      topicId: Data.topic ? Data.topic._id : null,
      goal: Data.goal,
      time: Data.availableTime,
      replies: Data.replies,
      // responseCount: Data.replies.length,
      responseCount: new Set(Data.replies.map(r => (r.user?._id || r.user).toString())).size,
      isCreator: Data.creator._id.toString() === req.user.id
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      totalData: formattedData.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const replyToStudyRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { message } = req.body;

    const { updatedRequest, addedReply } = await replyToStudyRequestService(
      requestId,
      req.user.id,
      message
    );

    // Socket.IO emissions
    const io = req.app.get('io');

    io.emit('request_updated', {
      requestId: requestId,
      responseCount: updatedRequest.replies.length
    });

    io.to(requestId).emit('new_reply_received', {
      requestId: requestId,
      reply: addedReply
    });

    res.status(200).json({
      success: true,
      message: "Reply sent successfully!",
      data: addedReply
    });
  } catch (error) {
    res.status(error.message.includes("required") ? 400 : 404).json({
      message: error.message
    });
  }
};

// new added
export const getChatHistory = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { partnerId } = req.query; // Passed from frontend if Creator is viewing
    const currentUserId = req.user.id; // From your auth middleware

    const chatData = await getChatHistoryService(
      requestId,
      currentUserId,
      partnerId
    );

    res.status(200).json({
      success: true,
      data: chatData
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


export const sendMessagetoBot = async (req, res) => {
  try {
    // Assuming you have middleware that puts userId in req.user
    // If not, use: const { userId } = req.body;
    const userId = req.user.id;
    const { sessionId, message } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    const result = await processUserMessageService(userId, sessionId, message);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Chat Controller Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/chat/history/:userId
// Used for the Sidebar list
export const getHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await getUserChatHistory(userId);

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/chat/session/:sessionId
// Used when clicking a chat in the sidebar to load old messages
export const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSessionDetails(sessionId);

    if (!session) return res.status(404).json({ success: false, message: "Chat not found" });

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const shareNursingTips = async (req, res) => {
  try {
    const userId = req.user.id; // Assumes Middleware adds user ID here
    const { content, topicId } = req.body;

    // Validate that at least content exists
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const newTip = await createTipService(userId, { content, topicId });

    res.status(201).json({
      success: true,
      message: "Tip shared successfully",
      data: newTip
    });

  } catch (error) {
    console.error("Error sharing tip:", error);
    res.status(500).json({ error: "Failed to share tip" });
  }
};

// Controller: Toggle Like
export const NursingtoggleLike = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postid } = req.params; // Matches your route: /user/like/:postid

    const updatedLikeCount = await NursingtoggleLikeService(userId, postid);

    res.status(200).json({
      success: true,
      message: "Like status updated",
      likesCount: updatedLikeCount
    });

  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to toggle like" });
  }
};

// Controller: Add Comment
export const NursingcommentPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postid } = req.params; // Matches your route: /user/comment/:postid
    const { text } = req.body;     // Matches your schema field 'text'

    if (!text) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const updatedTip = await addCommentService(userId, postid, text);

    res.status(200).json({
      success: true,
      message: "Comment added",
      data: updatedTip
    });

  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to add comment" });
  }
};

// Controller: Get All Posts
export const NusinggetAllPosts = async (req, res) => {
  try {
    // Allows filtering by topic if the frontend sends ?topicId=123
    const { topicId } = req.query;

    const tips = await getAllTipsService(topicId);

    res.status(200).json({
      success: true,
      count: tips.length,
      data: tips
    });

  } catch (error) {
    console.error("Error fetching tips:", error);
    res.status(500).json({ error: "Failed to fetch nursing tips" });
  }
};

// Controller: Delete Tip
export const deleteNursingTip = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role; // Assuming your middleware adds role
    const { tipId } = req.params;

    await deleteTipService(userId, tipId, userRole);

    res.status(200).json({
      success: true,
      message: "Tip deleted successfully"
    });

  } catch (error) {
    // Handle specific permission errors
    if (error.message === "Not authorized to delete this post") {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to delete tip" });
  }
};


// POST /api/affirmations
export const addAffirmation = async (req, res) => {
  try {
    const { date, text } = req.body;
    const userId = req.user.id; // Assuming you have middleware adding user to req

    if (!date || !text) {
      return res.status(400).json({ message: 'Date and text are required' });
    }

    const newAffirmation = await createAffirmation(userId, date, text);

    res.status(201).json({
      success: true,
      data: newAffirmation,
      message: "Affirmation added successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDashboardAnalytics = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    // 2. Call the service
    const analyticsData = await getDashboardAnalyticsService(userId);

    // 3. Send the response
    return res.status(200).json({
      success: true,
      data: analyticsData
    });

  } catch (error) {
    console.error("Dashboard Analytics Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard analytics",
      error: error.message
    });
  }
};



export const getAllBehavioralHealth = async (req, res) => {
  try {
    const practices = await getAllPiriorityPracticeService('behavioral-health');
    res.status(200).json({
      success: true,
      message: "Behavioral health practices fetched successfully",
      data: practices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// GET /api/affirmations?date=YYYY-MM-DD  (filter by date, optional)
export const getAffirmationsController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query; // Expects format YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ success: false, message: "Date parameter is required" });
    }

    const affirmations = await getAffirmationsByDate(userId, date);

    res.status(200).json({
      success: true,
      count: affirmations.length,
      data: affirmations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /user/affirmation/GetAllAffirmations
export const getAllAffirmationsController = async (req, res) => {
  try {
    const userId = req.user.id;
    const affirmations = await getAllAffirmations(userId);
    res.status(200).json({
      success: true,
      count: affirmations.length,
      data: affirmations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAffirmationController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { affirmationId } = req.params;
    const deletedaiifimation = await deleteAffirmation(affirmationId, userId);
    res.status(200).json({
      success: true,
      message: "Affirmation Deleted Successfully",
      data: deletedaiifimation
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAffirmationController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { affirmationId } = req.params;
    const { text, date } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Affirmation text is required" });
    }

    const updated = await updateAffirmation(affirmationId, userId, text.trim(), date);
    res.status(200).json({
      success: true,
      message: "Affirmation Updated Successfully",
      data: updated
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const checkInMood = async (req, res) => {
  try {
    const userId = req.user.id;
    const { moodValue } = req.body;
    if (moodValue === undefined || moodValue === null) {
      return res.status(400).json({ message: "Mood value is required" });
    }

    const result = await logDailyMood(userId, moodValue);
    res.status(201).json(result);

  } catch (error) {
    // Return 409 Conflict if they already posted
    if (error.message.includes("already checked in")) {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMoodAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await getStreakAndHistory(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get random audio
export const getRandomAudioForPlayer = async (req, res) => {
  try {
    const audioTrack = await getRandomAudioService();
    res.status(200).json({
      success: true,
      data: {
        title: audioTrack.title,
        url: audioTrack.audioUrl,
        category: audioTrack.category
      }
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

export const getAllPriorityPractice = async (req, res) => {
  try {
    const allPriorityPractice = await getAllPriorityPracticeService();
    res.status(200).json({
      success: true,
      data: allPriorityPractice
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllPriorityPracticeForSubTopic = async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const piriorityPractices = await getAllPriorityPracticeForSubTopicService(subtopicId);
    res.status(200).json({
      success: true,
      data: piriorityPractices
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export const addFlashcard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { topic, questionText, answerText, rationale } = req.body;

    const newCard = await createFlashcard({
      userId,
      topic,
      questionText,
      answerText,
      rationale
    });

    res.status(201).json({
      success: true,
      message: 'Added to flashcards!',
      data: newCard
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getFlashcards = async (req, res) => {
  try {
    const userId = req.user.id;
    const sortOrder = req.query.sort || 'desc';

    const flashcards = await getUserFlashcards(userId, sortOrder);

    res.status(200).json({
      success: true,
      count: flashcards.length,
      data: flashcards
    });
  } catch (error) {
    console.error("Flashcards retrieval error:", error);
    res.status(500).json({ success: false, message: error.message || 'Server error retrieving flashcards' });
  }
};

export const removeFlashcard = async (req, res) => {
  try {
    const userId = req.user.id;
    const flashcardId = req.params.id;

    const deletedCard = await deleteFlashcard(flashcardId, userId);

    if (!deletedCard) {
      return res.status(404).json({ success: false, message: 'Flashcard not found or unauthorized' });
    }

    res.status(200).json({ success: true, message: 'Flashcard deleted successfully' });
  } catch (error) {
    console.error("Flashcard deletion error:", error);
    res.status(500).json({ success: false, message: 'Server error deleting flashcard' });
  }
};

export const getBehavioralCounts = async (req, res) => {
  try {
    const { getBehavioralCountsService } = await import('../Services/adminServices/BehavioralServices/BehavioralServices.js');
    const data = await getBehavioralCountsService();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBehavioralQuestions = async (req, res) => {
  try {
    const { topic, limit } = req.query;
    const { getBehavioralQuestionsService } = await import('../Services/adminServices/BehavioralServices/BehavioralServices.js');
    const questions = await getBehavioralQuestionsService(topic, limit || 5, req.user.id);
    res.status(200).json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const generateDynamicStrategyDrill = async (req, res) => {
    try {
        const { strategyTab, subCategory, promptInstructions, count } = req.body;
        if (!strategyTab || !promptInstructions) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }
        
        const batchSize = count || 5;

        // Fixed, clinically validated banks (no AI generation) for selected Priority Framework topics.
        if (subCategory === 'ABC(Airway, Breathing, Circulation)' || subCategory === 'Maslow’s Hierarchy' || subCategory === 'ADPIE Nursing Process' || subCategory === 'Saftey First' || subCategory === 'Elimination Techniques' || subCategory === 'SATA Boot Camp' || subCategory === 'Critical Thinking Drills' || subCategory === 'Priority Patients' || subCategory === 'Pharm Shortcuts') {
            const questions = await getStrategyBankQuestions(subCategory, batchSize);
            return res.status(200).json({ success: true, data: questions });
        }

        const questions = await generateStrategyBatch(batchSize, strategyTab, subCategory, promptInstructions);
        
        res.status(200).json({ success: true, data: questions });
    } catch (error) {
        console.error('Dynamic generation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const startNclexSimulation = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await startNclexSimulationService(userId);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error("Error starting NCLEX simulation:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to start simulation" });
    }
};

export const submitNclexAnswer = async (req, res) => {
    try {
        const { attemptId, question, userAnswer, elapsedSeconds } = req.body;
        const result = await submitNclexAnswerService(attemptId, question, userAnswer, elapsedSeconds);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error("Error submitting NCLEX answer:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to submit answer" });
    }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const { forgotPasswordService } = await import('../Services/userServices/PasswordServices/PasswordServices.js');
    const response = await forgotPasswordService(email);
    res.status(200).json({ success: true, message: response.message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const { resetPasswordService } = await import('../Services/userServices/PasswordServices/PasswordServices.js');
    const response = await resetPasswordService(token, password);
    res.status(200).json({ success: true, message: response.message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};