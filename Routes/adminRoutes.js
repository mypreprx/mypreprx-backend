import express from 'express';
import upload from '../utilities/Multer.js';
import {
  loginAdmin,
  logoutAdmin,
  dashboard,

  getAllUsers,
  getAnalytics,

  genrateTopics,
  addTopics,
  updateTopics,
  getSubtopicsForTopic,
  deleteTopics,
  getAllTopics,
  seedSubtopicsDirectController,

  addCrashCourse,
  updateCrashCourse,
  deleteCourse,
  getAllCrashCourses,

  createVisualization,
  deleteVisualization,
  updateVisualization,
  getAllVisualization,

  generateQuestions,
  updateQuestion,
  deleteQuestion,
  deleteAllQuestionsForsubtopic,
  getSpecificQuestion,
  getAllQuestionforSubTopics,

  generatePriorityPractice,
  updatePriorityPractice,
  deletePriorityPractice,
  getAllPriorityPractice,
  getAllPriorityPracticeForSubTopic,


  StudyModeuploadAudio,
  getAudioForPlayer,
  getAllSubliminalAudios,
  updateSubliminalAudio,
  deleteSubliminalAudio,
  getAllSubliminalCategories,
  createQuote,
  updateQuote,
  deleteQuote,
  getLatestQuote,
  generateStrategyBank,
  generateStudyBank,
  generateBehavioralBank,

  generatePromoCode,
  createPromoCode,
  getAllPromoCodes,
  getPromoCode,
  updatePromoCode,
  deletePromoCode,
  // getSubtopicsByTopic
} from '../Controllers/adminController.js'
import { VerifyUser, allowRoles } from '../Middleware/auth/authentication.js';

const adminRoutes = express.Router();
adminRoutes.post('/admin/login', loginAdmin)
adminRoutes.get('/admin/dashboard', VerifyUser, allowRoles('admin'), dashboard)
adminRoutes.get('/admin/logout', VerifyUser, logoutAdmin)
adminRoutes.get('/admin/users', VerifyUser, allowRoles('admin'), getAllUsers)
adminRoutes.get('/admin/analytics', VerifyUser, allowRoles('admin'), getAnalytics)


adminRoutes.get('/admin/seed-subtopics-direct', seedSubtopicsDirectController)
adminRoutes.post('/admin/genrateTopics', VerifyUser, allowRoles('admin'), genrateTopics)
adminRoutes.post('/admin/addTopics', VerifyUser, allowRoles('admin'), addTopics)
adminRoutes.post('/admin/updateTopics/:id', VerifyUser, allowRoles('admin'), updateTopics)
adminRoutes.get('/admin/deleteTopics/:id', VerifyUser, allowRoles('admin'), deleteTopics)
adminRoutes.get('/admin/alltopics', VerifyUser, allowRoles('admin'), getAllTopics)
adminRoutes.get('/admin/subtopicsforTopic/:topicId', VerifyUser, allowRoles('admin'), getSubtopicsForTopic)


// adminRoutes.post('/admin/addCrashCourse', VerifyUser, allowRoles('admin'), upload.single('file'), addCrashCourse)
// adminRoutes.post('/admin/updateCrashCourse/:id', VerifyUser, allowRoles('admin'), upload.single('file'), updateCrashCourse)
adminRoutes.post('/admin/addCrashCourse', VerifyUser, allowRoles('admin'), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), addCrashCourse)
adminRoutes.post('/admin/updateCrashCourse/:id', VerifyUser, allowRoles('admin'), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), updateCrashCourse)
adminRoutes.get('/admin/deleteCrashCourse/:id', VerifyUser, allowRoles('admin'), deleteCourse)
adminRoutes.get('/admin/getAllCrashCourses', VerifyUser, allowRoles('admin'), getAllCrashCourses)

adminRoutes.post(
  '/admin/createVisualization',
  VerifyUser,
  allowRoles('admin'),
  upload.fields([{ name: 'media', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  createVisualization
)
adminRoutes.get('/admin/deleteVisualization/:id', VerifyUser, allowRoles('admin'), deleteVisualization)
adminRoutes.post(
  '/admin/updateVisualization/:id',
  VerifyUser,
  allowRoles('admin'),
  upload.fields([{ name: 'media', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  updateVisualization
)
// adminRoutes.get('/admin/getAllVisualization/:id', VerifyUser, allowRoles('admin'), getAllVisualization)
adminRoutes.get('/admin/getAllVisualization', VerifyUser, allowRoles('admin'), getAllVisualization)


adminRoutes.post('/admin/gerateTopicQuestion', VerifyUser, allowRoles('admin'), generateQuestions)
adminRoutes.post('/admin/updateQuestion/:questionId', VerifyUser, allowRoles('admin'), updateQuestion)
adminRoutes.get('/admin/deleteQuestion/:questionId', VerifyUser, allowRoles('admin'), deleteQuestion)
adminRoutes.get('/admin/deleteAllQuestionsForsubtopic/:subTopicId', VerifyUser, allowRoles('admin'), deleteAllQuestionsForsubtopic)
adminRoutes.get('/admin/getSpecificQuestion/:questionId', VerifyUser, allowRoles('admin'), getSpecificQuestion)
adminRoutes.get('/admin/getAllQuestionforSubTopics/:subTopicId', VerifyUser, allowRoles('admin'), getAllQuestionforSubTopics)

adminRoutes.post('/admin/genratePiriorityPractice', VerifyUser, allowRoles('admin'), generatePriorityPractice)
adminRoutes.post('/admin/updatePiriorityPractice/:practiceId', VerifyUser, allowRoles('admin'), updatePriorityPractice)
adminRoutes.delete('/admin/deletePiriorityPractice/:practiceId', VerifyUser, allowRoles('admin'), deletePriorityPractice)
adminRoutes.get('/admin/getAllPiriorityPractice/', VerifyUser, allowRoles('admin'), getAllPriorityPractice)
adminRoutes.get('/admin/getAllPiriorityPractice/:subtopicId', VerifyUser, allowRoles('admin'), getAllPriorityPracticeForSubTopic)


adminRoutes.post('/admin/StudyMode/createAudio', VerifyUser, allowRoles('admin'), upload.single('audio'), StudyModeuploadAudio)
adminRoutes.get('/admin/StudyMode/getAudio/:category', VerifyUser, allowRoles('admin'), getAudioForPlayer)
adminRoutes.get('/admin/StudyMode/allAudios', VerifyUser, allowRoles('admin'), getAllSubliminalAudios)
adminRoutes.put('/admin/StudyMode/updateAudio/:id', VerifyUser, allowRoles('admin'), upload.single('audio'), updateSubliminalAudio)
adminRoutes.delete('/admin/StudyMode/deleteAudio/:id', VerifyUser, allowRoles('admin'), deleteSubliminalAudio)
adminRoutes.get('/admin/StudyMode/categories', VerifyUser, allowRoles('admin'), getAllSubliminalCategories)


adminRoutes.post('/admin/CreateQuote', VerifyUser, allowRoles('admin'), createQuote)
adminRoutes.post('/admin/UpdateQuote/:id', VerifyUser, allowRoles('admin'), updateQuote)
adminRoutes.get('/admin/DeletQuote/:id', VerifyUser, allowRoles('admin'), deleteQuote)
adminRoutes.get('/admin/GetAllQuotes', VerifyUser, allowRoles('admin'), getLatestQuote)

adminRoutes.post('/admin/strategy/generateBank', VerifyUser, allowRoles('admin'), generateStrategyBank)
adminRoutes.post('/admin/study/generateBank', VerifyUser, allowRoles('admin'), generateStudyBank)
adminRoutes.post('/admin/behavioral/generateBank', VerifyUser, allowRoles('admin'), generateBehavioralBank)

// Promo codes — shared as a random code, a link, or a QR code.
adminRoutes.get('/admin/promo-codes/generate', VerifyUser, allowRoles('admin'), generatePromoCode)
adminRoutes.post('/admin/promo-codes', VerifyUser, allowRoles('admin'), createPromoCode)
adminRoutes.get('/admin/promo-codes', VerifyUser, allowRoles('admin'), getAllPromoCodes)
adminRoutes.get('/admin/promo-codes/:id', VerifyUser, allowRoles('admin'), getPromoCode)
adminRoutes.put('/admin/promo-codes/:id', VerifyUser, allowRoles('admin'), updatePromoCode)
adminRoutes.delete('/admin/promo-codes/:id', VerifyUser, allowRoles('admin'), deletePromoCode)

export default adminRoutes;