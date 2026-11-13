import express from 'express';

import {
  loginUser,
  registerUser,
  home,
  updateProfile,
  logout,
  googleLogin,
  redeemPromoCode,
  updateNclexExamDate,
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
  recordStudyDay,
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

import { VerifyUser, allowRoles, RequireBearerUser } from '../Middleware/auth/authentication.js';
import { RequirePremium } from '../Middleware/auth/entitlement.js';
import { rateLimit } from '../Middleware/rateLimit.js';

const userRoutes = express.Router();

// Any authenticated user — account/session plumbing that must keep working
// for non-subscribers so they can reach (and fix) their billing state.
const auth = [VerifyUser, allowRoles('user')];

// Authenticated users WITH an active entitlement. `premium` is written only by
// the Stripe webhook, so this cannot be bypassed from the client.
const premiumAuth = [...auth, RequirePremium];

// ---------- Public ----------
userRoutes.post('/user/register', registerUser);
userRoutes.post('/user/login', loginUser)
userRoutes.post('/user/forgot-password', forgotPassword)
userRoutes.post('/user/reset-password/:token', resetPassword)
userRoutes.post('/user/google-signin', googleLogin);

// ---------- Authenticated, not premium-gated ----------
userRoutes.get('/user/logout', ...auth, logout)
userRoutes.get('/user/Home', ...auth, home)
userRoutes.put('/user/update-profile', ...auth, upload.single('profilePicture'), updateProfile)

// ---------- Promo codes ----------
// Deliberately NOT premium-gated: a non-subscriber is exactly who redeems.
// RequireBearerUser runs before VerifyUser so a cross-site form post carrying
// only the session cookie cannot consume a code against someone's account.
userRoutes.post(
  '/user/promo/redeem',
  RequireBearerUser,
  ...auth,
  // AFTER auth on purpose: the limiter keys on the authenticated user id when
  // it can, so one account's burst cannot exhaust the budget for everyone else
  // sharing an IP (offices, campuses, mobile carriers).
  rateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: 'promo-redeem' }),
  redeemPromoCode
)

// ---------- Premium ----------
userRoutes.post('/user/chooseurGrowthZone', ...premiumAuth, choosurGrowthZone)

userRoutes.post('/user/CreateCustomQuiz', ...premiumAuth, CreateCustomQuiz)
userRoutes.post('/user/startQuiz', ...premiumAuth, submitQuiz)

// strategy Questions route
userRoutes.get('/user/getStrategyQuestions', ...premiumAuth, getStrategyQuestions);

// NCLEX Simulator routes
userRoutes.post('/user/start-nclex-simulation', ...premiumAuth, startNclexSimulation);
userRoutes.post('/user/submit-nclex-answer', ...premiumAuth, submitNclexAnswer);

userRoutes.post('/user/strategy/generate', ...premiumAuth, generateDynamicStrategyDrill)

userRoutes.get('/user/getAllTopics', ...premiumAuth, getAllTopics)
userRoutes.get('/user/getAllTopics/:topicId', ...premiumAuth, getSubtopicsByTopic)

userRoutes.get('/user/getAllCrashCourses', ...premiumAuth, getAllCrashCourses)
userRoutes.get('/user/getAllCrashCourses/:topicName', ...premiumAuth, getCrashCoursesByTopic)


userRoutes.get('/user/getAllPriorityPractice', ...premiumAuth, getAllPriorityPractice)
userRoutes.get('/user/getAllPriorityPractice/:subtopicId', ...premiumAuth, getAllPriorityPracticeForSubTopic)

userRoutes.post('/user/sharePost', ...premiumAuth, upload.single('file'), sharePost)
userRoutes.get('/user/like/:postid', ...premiumAuth, toggleLike)
userRoutes.get('/user/comment/:postid', ...premiumAuth, commentPost)
userRoutes.get('/user/getallPosts', ...premiumAuth, getAllPosts)


userRoutes.post('/user/createNote', ...premiumAuth, createNote)
userRoutes.post('/user/updateNote/:noteid', ...premiumAuth, updateNote)
userRoutes.get('/user/deleteNote/:noteid', ...premiumAuth, deleteNote)
userRoutes.get('/user/getallNotes', ...premiumAuth, getallNotes)

userRoutes.post('/user/createStudyRequest', ...premiumAuth, createStudyRequest)
userRoutes.get('/user/getAllStudyRequests', ...premiumAuth, getAllStudyRequests)
userRoutes.post('/user/replyToStudyRequest/:requestId', ...premiumAuth, replyToStudyRequest)
// new added
userRoutes.get('/user/studyBuddy/chat/:requestId', ...premiumAuth, getChatHistory)


userRoutes.post('/user/sendMessagetoBot', ...premiumAuth, sendMessagetoBot)
userRoutes.get('/user/getHistory/:userId', ...premiumAuth, getHistory)//for sidebar chat histry
userRoutes.get('/user/getSession/:sessionId', ...premiumAuth, getSession)


userRoutes.post('/user/shareNursingTips', ...premiumAuth, shareNursingTips)
userRoutes.get('/user/tipslike/:postid', ...premiumAuth, NursingtoggleLike)
userRoutes.get('/user/tipscomment/:postid', ...premiumAuth, NursingcommentPost)
userRoutes.get('/user/tipsgetallPosts', ...premiumAuth, NusinggetAllPosts)
userRoutes.get('/user/deleteTip/:tipId', ...premiumAuth, deleteNursingTip)

userRoutes.get('/user/StudyMode/getAudio/:category', ...premiumAuth, getAudioForPlayer)
userRoutes.get('/user/StudyMode/getRandomAudio', ...premiumAuth, getRandomAudioForPlayer)
userRoutes.get('/user/StudyMode/categories', ...premiumAuth, getAllSubliminalCategories)

userRoutes.get('/user/affirmation/GetAffirmations', ...premiumAuth, getAffirmationsController)
userRoutes.get('/user/affirmation/GetAllAffirmations', ...premiumAuth, getAllAffirmationsController)
userRoutes.post('/user/affirmation/CreateAffirmation', ...premiumAuth, addAffirmation)
userRoutes.put('/user/affirmation/UpdateAffirmation/:affirmationId', ...premiumAuth, updateAffirmationController)
userRoutes.delete('/user/affirmation/DeleteAffirmation/:affirmationId', ...premiumAuth, deleteAffirmationController)

userRoutes.post('/user/DailyFeeling/Check-in', ...premiumAuth, checkInMood)
userRoutes.get('/user/DailyFeeling/Analytics/:userId', ...premiumAuth, getMoodAnalytics)
userRoutes.get('/user/Analytics/:userId', ...premiumAuth, getDashboardAnalytics)
userRoutes.post('/user/record-study-day', ...premiumAuth, recordStudyDay)

userRoutes.get('/user/getAllBehavioralHealth', ...premiumAuth,
getBehavioralQuestions)

userRoutes.get('/user/behavioral/counts', ...premiumAuth,
getBehavioralCounts)
userRoutes.get('/user/getQuestionsBySubtopic/:subtopicId', ...premiumAuth, getQuestionsBySubtopic)
userRoutes.get('/user/getAllQuestionsByTopic/:topicId', ...premiumAuth, getAllQuestionsByTopic)

// Visualization Room
userRoutes.get('/user/getAllVisualization', ...premiumAuth, getAllVisualization)

userRoutes.get('/user/morningQuote/getLatestQuote', ...premiumAuth, getLatestQuote)
userRoutes.get('/user/daily-affirmation', ...premiumAuth, getDailyAffirmation)

// Flashcards
userRoutes.post('/user/flashcards/add', ...premiumAuth, addFlashcard);
userRoutes.get('/user/flashcards/get', ...premiumAuth, getFlashcards);
userRoutes.delete('/user/flashcards/delete/:id', ...premiumAuth, removeFlashcard);

export default userRoutes;

userRoutes.put('/user/nclex-exam-date', ...auth, updateNclexExamDate);

