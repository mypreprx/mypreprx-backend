import express from 'express';

import {
  loginUser,
  registerUser,
  home,
  updateProfile,
  logout,
  googleLogin,
  CreateCustomQuiz,
  choosurGrowthZone,
  submitQuiz,
  getAllTopics,
  getSubtopicsByTopic,
  getAllCrashCourses,
  getCrashCoursesByTopic,
  sharePost,
  toggleLike,
  commentPost,
  getAllPosts,
  createNote,
  updateNote,
  deleteNote,
  getallNotes,
  createStudyRequest,
  getAllStudyRequests,
  replyToStudyRequest,
  sendMessagetoBot,
  getChatHistory,
  getHistory,
  getSession,
  shareNursingTips,
  NursingtoggleLike,
  NursingcommentPost,
  NusinggetAllPosts,
  deleteNursingTip,
  addAffirmation,
  getAffirmationsController,
  getAllAffirmationsController,
  deleteAffirmationController,
  updateAffirmationController,
  checkInMood,
  getMoodAnalytics,
  getDashboardAnalytics,
  getAllPriorityPractice,
  getAllPriorityPracticeForSubTopic,
  getRandomAudioForPlayer,
  getBehavioralQuestions,
  getBehavioralCounts,
  getQuestionsBySubtopic,
  getAllQuestionsByTopic,
  getAllVisualization,
  addFlashcard,
  getFlashcards,
  removeFlashcard,
  getStrategyQuestions,
  getDailyAffirmation,
  generateDynamicStrategyDrill,
  startNclexSimulation,
  submitNclexAnswer,
  forgotPassword,
  resetPassword
} from '../Controllers/userController.js';

import {
  getAudioForPlayer,
  getAllSubliminalCategories,
  getLatestQuote
} from '../Controllers/adminController.js'
import upload from '../utilities/Multer.js';

import { VerifyUser, allowRoles } from '../Middleware/auth/authentication.js';

const userRoutes = express.Router();

userRoutes.post('/user/register', registerUser);
userRoutes.post('/user/login', loginUser)
userRoutes.post('/user/forgot-password', forgotPassword)
userRoutes.post('/user/reset-password/:token', resetPassword)
userRoutes.get('/user/logout', VerifyUser, allowRoles('user'), logout)
userRoutes.post('/user/google-signin', googleLogin);

// userRoutes.post('/user/chooseurGrowthZone',VerifyUser,chooseurGrowthZone)

userRoutes.get('/user/Home', VerifyUser, allowRoles('user'), home)
userRoutes.post('/user/chooseurGrowthZone', VerifyUser, allowRoles('user'), choosurGrowthZone)
userRoutes.put('/user/update-profile', VerifyUser, allowRoles('user'), upload.single('profilePicture'), updateProfile)

userRoutes.post('/user/CreateCustomQuiz', VerifyUser, allowRoles('user'), CreateCustomQuiz)
userRoutes.post('/user/startQuiz', VerifyUser, allowRoles('user'), submitQuiz)

// strategy Questions route
userRoutes.get('/user/getStrategyQuestions', VerifyUser, allowRoles('user'), getStrategyQuestions);

// NCLEX Simulator routes
userRoutes.post('/user/start-nclex-simulation', VerifyUser, allowRoles('user'), startNclexSimulation);
userRoutes.post('/user/submit-nclex-answer', VerifyUser, allowRoles('user'), submitNclexAnswer);

userRoutes.post('/user/strategy/generate', VerifyUser, allowRoles('user'), generateDynamicStrategyDrill)

userRoutes.get('/user/getAllTopics', VerifyUser, allowRoles('user'), getAllTopics)
userRoutes.get('/user/getAllTopics/:topicId', VerifyUser, allowRoles('user'), getSubtopicsByTopic)

userRoutes.get('/user/getAllCrashCourses', VerifyUser, allowRoles('user'), getAllCrashCourses)
userRoutes.get('/user/getAllCrashCourses/:topicName', VerifyUser, allowRoles('user'), getCrashCoursesByTopic)


userRoutes.get('/user/getAllPriorityPractice', VerifyUser, allowRoles('user'), getAllPriorityPractice)
userRoutes.get('/user/getAllPriorityPractice/:subtopicId', VerifyUser, allowRoles('user'), getAllPriorityPracticeForSubTopic)

userRoutes.post('/user/sharePost', VerifyUser, allowRoles('user'), upload.single('file'), sharePost)
userRoutes.get('/user/like/:postid', VerifyUser, allowRoles('user'), toggleLike)
userRoutes.post('/user/comment/:postid', VerifyUser, allowRoles('user'), commentPost)
userRoutes.get('/user/getallPosts', VerifyUser, allowRoles('user'), getAllPosts)


userRoutes.post('/user/createNote', VerifyUser, allowRoles('user'), createNote)
userRoutes.post('/user/updateNote/:noteid', VerifyUser, allowRoles('user'), updateNote)
userRoutes.get('/user/deleteNote/:noteid', VerifyUser, allowRoles('user'), deleteNote)
userRoutes.get('/user/getallNotes', VerifyUser, allowRoles('user'), getallNotes)

userRoutes.post('/user/createStudyRequest', VerifyUser, allowRoles('user'), createStudyRequest)
userRoutes.get('/user/getAllStudyRequests', VerifyUser, allowRoles('user'), getAllStudyRequests)
userRoutes.post('/user/replyToStudyRequest/:requestId', VerifyUser, allowRoles('user'), replyToStudyRequest)
// new added
userRoutes.get('/user/studyBuddy/chat/:requestId', VerifyUser, allowRoles('user'), getChatHistory)


userRoutes.post('/user/sendMessagetoBot', VerifyUser, allowRoles('user'), sendMessagetoBot)
userRoutes.get('/user/getHistory/:userId', VerifyUser, allowRoles('user'), getHistory)//for sidebar chat histry
userRoutes.get('/user/getSession/:sessionId', VerifyUser, allowRoles('user'), getSession)


userRoutes.post('/user/shareNursingTips', VerifyUser, allowRoles('user'), shareNursingTips)
userRoutes.get('/user/tipslike/:postid', VerifyUser, allowRoles('user'), NursingtoggleLike)
userRoutes.post('/user/tipscomment/:postid', VerifyUser, allowRoles('user'), NursingcommentPost)
userRoutes.get('/user/tipsgetallPosts', VerifyUser, allowRoles('user'), NusinggetAllPosts)
userRoutes.get('/user/deleteTip/:tipId', VerifyUser, allowRoles('user'), deleteNursingTip)

userRoutes.get('/user/StudyMode/getAudio/:category', VerifyUser, allowRoles('user'), getAudioForPlayer)
userRoutes.get('/user/StudyMode/getRandomAudio', VerifyUser, allowRoles('user'), getRandomAudioForPlayer)
userRoutes.get('/user/StudyMode/categories', VerifyUser, allowRoles('user'), getAllSubliminalCategories)

userRoutes.get('/user/affirmation/GetAffirmations', VerifyUser, allowRoles('user'), getAffirmationsController)
userRoutes.get('/user/affirmation/GetAllAffirmations', VerifyUser, allowRoles('user'), getAllAffirmationsController)
userRoutes.post('/user/affirmation/CreateAffirmation', VerifyUser, allowRoles('user'), addAffirmation)
userRoutes.put('/user/affirmation/UpdateAffirmation/:affirmationId', VerifyUser, allowRoles('user'), updateAffirmationController)
userRoutes.delete('/user/affirmation/DeleteAffirmation/:affirmationId', VerifyUser, allowRoles('user'), deleteAffirmationController)

userRoutes.post('/user/DailyFeeling/Check-in', VerifyUser, allowRoles('user'), checkInMood)
userRoutes.get('/user/DailyFeeling/Analytics/:userId', VerifyUser, allowRoles('user'), getMoodAnalytics)
userRoutes.get('/user/Analytics/:userId', VerifyUser, allowRoles('user'), getDashboardAnalytics)

// userRoutes.get('/user/getAllPiriorityPractice', VerifyUser, allowRoles('user'), getAllPiriorityPractice)
userRoutes.get('/user/getAllBehavioralHealth', VerifyUser, allowRoles('user'), 
getBehavioralQuestions)

userRoutes.get('/user/behavioral/counts', VerifyUser, allowRoles('user'), 
getBehavioralCounts)
userRoutes.get('/user/getQuestionsBySubtopic/:subtopicId', VerifyUser, allowRoles('user'), getQuestionsBySubtopic)
userRoutes.get('/user/getAllQuestionsByTopic/:topicId', VerifyUser, allowRoles('user'), getAllQuestionsByTopic)

// Visualization Room
userRoutes.get('/user/getAllVisualization', VerifyUser, allowRoles('user'), getAllVisualization)

userRoutes.get('/user/morningQuote/getLatestQuote', VerifyUser, allowRoles('user'), getLatestQuote)
userRoutes.get('/user/daily-affirmation', VerifyUser, allowRoles('user'), getDailyAffirmation)

// Flashcards
userRoutes.post('/user/flashcards/add', VerifyUser, allowRoles('user'), addFlashcard);
userRoutes.get('/user/flashcards/get', VerifyUser, allowRoles('user'), getFlashcards);
userRoutes.delete('/user/flashcards/delete/:id', VerifyUser, allowRoles('user'), removeFlashcard);

export default userRoutes;