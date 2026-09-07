import {
  loginAdminService,
  logoutAdminService,
  getAdminDashboardService,
  getAllUsersService
} from '../Services/adminServices/RegisterLoginServices/registerLogin.js';

import {
  generateSubtopicsService,
  findSubtopicsByTopicIdService,
  updateTopicsService,
  deleteTopicsService,
  getAllTopicsService,
  addtopicService,
  seedSubtopicsDirectService,
  // getSubtopicsByTopicService
} from '../Services/adminServices/TopicServices/TopicServices.js'



import {
  addCrashCourseService,
  updateCrashCourseService,
  deleteCourseService,
  getAllCrashCoursesService
} from '../Services/adminServices/CrashCourseServices/CrashCourse.js'

import {
  createVisualizationService,
  deleteVisualizationService,
  updateVisualizationService,
  getAllVisualizationService
} from '../Services/adminServices/Visualizations/visualization.js'

import {
  createQuestionsForSubTopicService,
  updateQuestionService,
  deleteQuestionService,
  deleteAllQuestionsForSubTopic,
  getAllQuestionforSubTopicsService,
  getSpecificQuestionService
} from '../Services/adminServices/topicwiseQuestion/topicwiseQuestion.js'

import {
  createPriorityPracticeService,
  updatePriorityPracticeService,
  deletePriorityPracticeService,
  getAllPriorityPracticeForSubTopicService,
  getAllPriorityPracticeService
} from '../Services/adminServices/PiriorityPracticeService/PirPracticeService.js'

import {
  createAudioEntry,
  getAudioByCategory,
  getAllAudiosService,
  updateAudioService,
  deleteAudioService,
  getAllCategoriesService
} from '../Services/adminServices/SubliminalAudio/SubliminalAudioService.js'
import {
  createQuoteService,
  updateQuoteService,
  getLatestQuoteService,
  deleteQuoteService
} from '../Services/adminServices/MorningQuotes/QuoteAffirmation.js'

import {
  generateStrategyBankService
} from '../Services/adminServices/StrategyServices/StrategyServices.js'

import {
  getAdminAnalyticsService
} from '../Services/adminServices/AnalyticsServices/analyticsService.js'

import {
  generateBehavioralBankService
} from '../Services/adminServices/BehavioralServices/BehavioralServices.js'

import {
  generateStudyBankService
} from '../Services/adminServices/StudyServices/StudyServices.js'

// ==========================================
// ADMIN AUTHENTICATION CONTROLLERS
// ==========================================

export const loginAdmin = async (req, res) => {
  try {
    const { token, admin } = await loginAdminService(req.body);
    res.cookie('Token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    res.status(200).json({
      message: "Login successful",
      token,
      admin: admin
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 401).json({
      message: error.message
    });
  }
};

export const logoutAdmin = async (req, res) => {
  try {
    await logoutAdminService(req.user?.adminId);
    res.clearCookie('Token');
    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const dashboard = async (req, res) => {
  try {
    const admin = await getAdminDashboardService(req.user.adminId);
    res.status(201).json({
      message: "Welcome To Dashboard",
      user: admin
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

// ==========================================
// USER MANAGEMENT CONTROLLERS
// ==========================================

export const getAnalytics = async (req, res) => {
  try {
    const range = req.query.range || 'Last 30 Days';
    const data = await getAdminAnalyticsService(range);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const allAccounts = await getAllUsersService();
    res.status(200).json({
      success: true,
      message: "All users fetched successfully",
      data: allAccounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message
    });
  }
};

// ==========================================
// TOPIC MANAGEMENT CONTROLLERS
// ==========================================

export const genrateTopics = async (req, res) => {
  try {
    const { topic } = req.body; // { "topic": "Pharmacology" }

    if (!topic) return res.status(400).json({ message: "Topic is required" });

    const result = await generateSubtopicsService(topic);
    res.status(201).json({ success: true, data: result });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Behavioral Health Generation
export const generateBehavioralBank = async (req, res) => {
    try {
        const { topic, nofCases } = req.body;
        const cases = await generateBehavioralBankService(topic, nofCases);
        res.status(201).json({ success: true, count: cases.length, cases });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const seedSubtopicsDirectController = async (req, res) => {
  try {
    const result = await seedSubtopicsDirectService();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addTopics = async (req, res) => {
  try {
    const { topicId, subtopic } = req.body;
    if (!topicId || !subtopic) {
      return res.status(400).json({
        success: false,
        message: "TopicId and Subtopic are required",
      })
    }
    const result = await addtopicService(topicId, subtopic);
    res.status(201).json({
      success: true,
      result
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
export const updateTopics = async (req, res) => {
  try {
    const { id } = req.params;
    const topic = await updateTopicsService(id, req.body);
    res.status(200).json({
      success: true,
      message: "Topic and Subtopics updated successfully",
      data: topic
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteTopics = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteTopicsService(id);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllTopics = async (req, res) => {
  try {
    const topics = await getAllTopicsService();
    res.status(200).json({
      success: true,
      message: "All topics fetched successfully",
      data: topics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching topics",
      error: error.message
    });
  }
};
export const getSubtopicsForTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    // Basic ID format validation could go here (e.g., checking if it's a valid ObjectId)

    const subtopics = await findSubtopicsByTopicIdService(topicId);

    return res.status(200).json({
      success: true,
      count: subtopics.length,
      data: subtopics,
    });

  } catch (error) {
    console.error("Error in getSubtopicsForTopic:", error);

    // Specific Error Handling
    if (error.message === "TOPIC_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "The specified topic does not exist.",
      });
    }

    // Generic Server Error
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to retrieve subtopics.",
      error: error.message,
    });
  }
};
// ==========================================
// CRASH COURSE CONTROLLERS
// ==========================================

export const addCrashCourse = async (req, res) => {
  try {
    // const course = await addCrashCourseService(req.body, req.file);
    console.log('Addcrash Course Controller Triggers');

    const mainFile = req.files?.file?.[0] || null;
    const thumbnailFile = req.files?.thumbnail?.[0] || null;
    const course = await addCrashCourseService(req.body, mainFile, thumbnailFile);

    res.status(201).json({
      success: true,
      message: "Course added successfully",
      data: course
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateCrashCourse = async (req, res) => {
  try {
    // const { id } = req.params;
    // const course = await updateCrashCourseService(id, req.body, req.file);
    const { id } = req.params;
    const mainFile = req.files?.file?.[0] || null;
    const thumbnailFile = req.files?.thumbnail?.[0] || null;
    const course = await updateCrashCourseService(id, req.body, mainFile, thumbnailFile);
    res.status(200).json({
      success: true,
      message: "Crash Course updated successfully",
      data: course
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await deleteCourseService(id);
    res.status(200).json({
      success: true,
      message: `Course and associated files deleted: ${course.title}`,
      data: course
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllCrashCourses = async (req, res) => {
  try {
    const courses = await getAllCrashCoursesService();
    res.status(200).json({
      success: true,
      message: "All crash courses fetched successfully",
      data: courses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching crash courses",
      error: error.message
    });
  }
};

// ==========================================
// VISUALIZATION CONTROLLERS
// ==========================================

export const createVisualization = async (req, res) => {
  try {
    const mediaFile = req.files?.media?.[0] ?? null;
    const thumbnailFile = req.files?.thumbnail?.[0] ?? null;
    const visual = await createVisualizationService(req.body, mediaFile, thumbnailFile);
    res.status(201).json({
      success: true,
      data: visual,
      message: 'Visualization created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteVisualization = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteVisualizationService(id);
    res.status(200).json({
      success: true,
      message: 'Visualization and associated files deleted successfully'
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateVisualization = async (req, res) => {
  try {
    const { id } = req.params;
    const mediaFile = req.files?.media?.[0] ?? null;
    const thumbnailFile = req.files?.thumbnail?.[0] ?? null;
    const visual = await updateVisualizationService(id, req.body, mediaFile, thumbnailFile);
    res.status(200).json({
      success: true,
      message: 'Visualization updated successfully',
      data: visual
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

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




export const generateQuestions = async (req, res) => {
  try {
    const { subTopicId } = req.body;

    // Validate input
    if (!subTopicId) {
      return res.status(400).json({ success: false, message: "subTopicId is required" });
    }

    // Call the service
    const questions = await createQuestionsForSubTopicService(subTopicId);

    // Send success response
    res.status(201).json({
      success: true,
      count: questions.length,
      data: questions,
      message: "Questions generated and saved successfully."
    });

  } catch (error) {
    console.error("Controller Error:", error.message);

    // Handle specific errors (like ID not found) vs generic server errors
    if (error.message === "SubTopic not found") {
      return res.status(404).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: "Server Error during generation." });
  }
};

export const updateQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const updateData = req.body;
    const updateQuestion = await updateQuestionService(questionId, updateData);
    res.status(200).json({
      success: true,
      message: "Question updated Successfully",
      data: updateQuestion
    })
  } catch (error) {
    res.status(500).json({ success: false, message: `Server Error ${error.message}` });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const deleteQuestion = await deleteQuestionService(questionId);
    res.status(200).json({
      success: true,
      message: "Question deleted Successfully",
      data: deleteQuestion
    })
  } catch (error) {
    res.status(500).json({ success: false, message: `Server Error ${error.message}` });
  }
}

export const deleteAllQuestionsForsubtopic = async (req, res) => {
  try {
    const { subTopicId } = req.params;
    const deleteQuestion = await deleteAllQuestionsForSubTopic(subTopicId);
    res.status(200).json({
      success: true,
      message: `all Question deleted Successfully for SubtopicId: ${subTopicId}`,
      data: deleteQuestion
    })
  } catch (error) {
    res.status(500).json({ success: false, message: `Server Error ${error.message}` });
  }
};

export const getSpecificQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await getSpecificQuestionService(questionId);
    res.status(200).json({
      success: true,
      data: question
    })
  } catch (error) {
    res.status(500).json({ success: false, message: `Server Error ${error.message}` });
  }
};

export const getAllQuestionforSubTopics = async (req, res) => {
  try {
    const { subTopicId } = req.params;
    const questions = await getAllQuestionforSubTopicsService(subTopicId);
    res.status(200).json({
      success: true,
      data: questions
    })
  } catch (error) {
    res.status(500).json({ success: false, message: `Server Error ${error.message}` });
  }
};


export const generatePriorityPractice = async (req, res) => {
  const { subTopicId } = req.body;

  try {
    // Validate input
    if (!subTopicId) {
      return res.status(400).json({ error: "subTopicId is required" });
    }

    // Call the service layer
    const data = await createPriorityPracticeService(subTopicId);

    // Send success response
    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    // Handle specific errors
    if (error.message === "Subtopic not found") {
      return res.status(404).json({ error: error.message });
    }

    // Handle general server errors
    console.error("Error generating priority practice:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};

export const updatePriorityPractice = async (req, res) => {
  const { practiceId } = req.params;
  const updateData = req.body;

  try {
    if (!practiceId) {
      return res.status(400).json({ error: "Practice ID is required" });
    }

    // Call Service
    const updatedData = await updatePriorityPracticeService(practiceId, updateData);

    res.status(200).json({
      success: true,
      message: "Priority Practice updated successfully",
      data: updatedData
    });

  } catch (error) {
    if (error.message === "Practice Case Study not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Error updating practice:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Controller: Delete Priority Practice
export const deletePriorityPractice = async (req, res) => {
  const { practiceId } = req.params;

  try {
    if (!practiceId) {
      return res.status(400).json({ error: "Practice ID is required" });
    }

    // Call Service
    const deletedData = await deletePriorityPracticeService(practiceId);

    res.status(200).json({
      success: true,
      message: "Priority Practice deleted successfully",
      data: deletedData
    });

  } catch (error) {
    if (error.message === "Practice Case Study not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Error deleting practice:", error);
    res.status(500).json({ error: "Internal Server Error" });
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
// --- Admin: Upload Audio ---
export const StudyModeuploadAudio = async (req, res) => {
  try {
    // 1. First Check: Did Multer pass a file through?
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please upload a valid file."
      });
    }

    // 2. Double Check: Ensure it is strictly an audio file
    // Although Multer handles this, this is a final safety gate.
    if (!req.file.mimetype.startsWith('audio/')) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. This feature only supports Audio files."
      });
    }
    const relativePath = `uploads/audios/${req.file.filename}`;
    // 3. Prepare Data
    const audioData = {
      title: req.body.title || req.file.originalname,
      category: req.body.category,
      audioUrl: relativePath,
      mimeType: req.file.mimetype,
      isActive: req.body.isActive === 'true' || req.body.isActive === true || req.body.isActive === undefined
    };

    // 4. Call Service
    const newAudio = await createAudioEntry(audioData);

    // 5. Send Response
    res.status(201).json({
      success: true,
      message: "Audio uploaded and saved successfully.",
      data: newAudio
    });

  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- User: Get Audio to Play ---
export const getAudioForPlayer = async (req, res) => {
  try {
    const { category } = req.params; // e.g., "Confidence" from URL

    // 1. Call Service
    const audioTrack = await getAudioByCategory(category);

    // 2. Send Response
    res.status(200).json({
      success: true,
      data: {
        title: audioTrack.title,
        url: audioTrack.audioUrl, // Frontend uses this URL to play
        category: audioTrack.category
      }
    });

  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// --- Admin: Get All Audios ---
export const getAllSubliminalAudios = async (req, res) => {
  try {
    const audios = await getAllAudiosService();
    res.status(200).json({
      success: true,
      data: audios
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Admin: Update Audio ---
export const updateSubliminalAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (req.file) {
      updateData.audioUrl = `uploads/audios/${req.file.filename}`;
      updateData.mimeType = req.file.mimetype;
    }

    if (req.body.isActive !== undefined) {
      updateData.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    }

    const updated = await updateAudioService(id, updateData);
    res.status(200).json({
      success: true,
      message: "Audio updated successfully.",
      data: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Admin: Delete Audio ---
export const deleteSubliminalAudio = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteAudioService(id);
    res.status(200).json({
      success: true,
      message: "Audio deleted successfully."
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Common: Get All Categories ---
export const getAllSubliminalCategories = async (req, res) => {
  try {
    const categories = await getAllCategoriesService();
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const getLatestQuote = async (req, res) => {
  try {
    const quote = await getLatestQuoteService();

    // If no quote exists in DB, return a default system message
    if (!quote) {
      return res.status(200).json({
        success: true,
        data: {
          text: "Stay positive and work hard!",
          author: "System"
        }
      });
    }

    res.status(200).json({
      success: true,
      data: quote
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


/* =========================================
   ADMIN FUNCTIONALITY (Create, Update, Delete)
   ========================================= */

// --- Strategy Zone Banks ---
export const generateStrategyBank = async (req, res) => {
  try {
    const { strategyTab, subCategory, promptInstructions, nofQuest } = req.body;
    if (!strategyTab || !nofQuest) {
      return res.status(400).json({ success: false, message: "strategyTab and nofQuest are required" });
    }
    const questions = await generateStrategyBankService(strategyTab, subCategory, promptInstructions, nofQuest);
    res.status(201).json({
      success: true,
      count: questions.length,
      message: "Strategy bank generated successfully."
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Study Zone Banks ---
export const generateStudyBank = async (req, res) => {
  try {
    const { topicId, difficulty, nofQuest } = req.body;
    if (!topicId || !difficulty || !nofQuest) {
      return res.status(400).json({ success: false, message: "topicId, difficulty, and nofQuest are required" });
    }
    const questions = await generateStudyBankService(topicId, difficulty, nofQuest);
    res.status(201).json({
      success: true,
      count: questions.length,
      message: "Study bank generated successfully."
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createQuote = async (req, res) => {
  try {
    const { text } = req.body;

    // Basic Validation
    if (!text) {
      return res.status(400).json({ success: false, message: "Quote text is required" });
    }

    const newQuote = await createQuoteService(text);

    res.status(201).json({
      success: true,
      message: "Quote posted successfully",
      data: newQuote
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body; // Contains { text, author }

    const updatedQuote = await updateQuoteService(id, updateData);

    if (!updatedQuote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    res.status(200).json({
      success: true,
      message: "Quote updated successfully",
      data: updatedQuote
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteQuote = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedQuote = await deleteQuoteService(id);

    if (!deletedQuote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    res.status(200).json({
      success: true,
      message: "Quote deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};