import userModel from '../../../Models/userSchema.js';
import topicModel from '../../../Models/topicSchema.js';
import generatequiz from '../../../utilities/quizGenerator.js';
import quizQuestionModel from '../../../Models/quizQuestion.js';
import QuizAttemptModel from '../../../Models/quizAttempt.js';
import QuestionModel from '../../../Models/Question.js';
import subtopicModel from '../../../Models/subTopicSchema.js';

export const createCustomQuizService = async (quizData, userId) => {
  const { titles, nofQuest, difficulty, isDailyDose, isCustomQuiz, questionType } = quizData;

  if (!titles || titles.length === 0 || !nofQuest || !difficulty) {
    throw new Error("Please fill all input fields");
  }

  const topicDocs = await topicModel.find({ title: { $in: titles } });

  if (topicDocs.length !== titles.length) {
    throw new Error("One or more topics not found");
  }

  const topicIds = topicDocs.map(t => t._id);

  if (isCustomQuiz) {
    const subtopics = await subtopicModel.find({ topicId: { $in: topicIds } }).lean();
    if (subtopics.length === 0) {
      throw new Error("No subtopics found for the selected topics");
    }
    const subtopicIds = subtopics.map(s => s._id);

    const matchStage = { subTopic: { $in: subtopicIds } };

    if (questionType && questionType !== 'All') {
      matchStage.questionType = questionType;
    }

    if (difficulty) {
      matchStage.$or = [
        { difficulty: { $regex: difficulty, $options: 'i' } },
        { difficulty: difficulty }
      ];
    }

    const count = await QuestionModel.countDocuments(matchStage);
    if (count === 0) {
      throw new Error("No questions available matching your criteria. Try different topics or settings.");
    }

    const sampleSize = Math.min(nofQuest, count);
    const questions = await QuestionModel.aggregate([
      { $match: matchStage },
      { $sample: { size: sampleSize } },
      { $lookup: { from: 'subtopics', localField: 'subTopic', foreignField: '_id', as: 'subtopicDoc' } },
      { $unwind: { path: '$subtopicDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'topics', localField: 'subtopicDoc.topicId', foreignField: '_id', as: 'topicDoc' } },
      { $unwind: { path: '$topicDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          question: 1,
          option: 1,
          correctAnswer: 1,
          questionType: 1,
          rationale: 1,
          whyIncorrect: 1,
          memoryTrick: 1,
          nclexTrap: 1,
          primaryFramework: 1,
          secondaryFramework: 1,
          clinicalPearl: 1,
          optionEvaluations: 1,
          difficulty: 1,
          nclexConnection: 1,
          clinicalPediatricBreakdown: 1,
          clinicalMedSurgBreakdown: 1,
          managementOfCareBreakdown: 1,
          basicCareComfortBreakdown: 1,
          reductionOfRiskBreakdown: 1,
          physiologicalAdaptationBreakdown: 1,
          pharmacologicalParenteralBreakdown: 1,
          pharmacologyBreakdown: 1,
          safetyInfectionControlBreakdown: 1,
          psychosocialBreakdown: 1,
          healthPromotionBreakdown: 1,
          pedrxStrategy: 1,
          clinicalPharmacologyBreakdown: 1,
          topic: '$topicDoc.title',
          subtopic: '$subtopicDoc.title'
        }
      }
    ]);

    const finalQuestions = questions.map(q => ({
      _id: q._id,
      question: q.question,
      option: q.option,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType,
      difficultyLevel: q.difficulty,
      rationale: q.rationale || '',
      whyIncorrect: q.whyIncorrect || '',
      memoryTrick: q.memoryTrick || '',
      nclexTrap: q.nclexTrap || '',
      primaryFramework: q.primaryFramework || '',
      secondaryFramework: q.secondaryFramework || '',
      clinicalPearl: q.clinicalPearl || '',
      optionEvaluations: q.optionEvaluations || [],
      nclexConnection: q.nclexConnection || '',
      clinicalPediatricBreakdown: q.clinicalPediatricBreakdown || '',
      clinicalMedSurgBreakdown: q.clinicalMedSurgBreakdown || '',
      managementOfCareBreakdown: q.managementOfCareBreakdown || '',
      basicCareComfortBreakdown: q.basicCareComfortBreakdown || '',
      reductionOfRiskBreakdown: q.reductionOfRiskBreakdown || '',
      physiologicalAdaptationBreakdown: q.physiologicalAdaptationBreakdown || '',
      pharmacologicalParenteralBreakdown: q.pharmacologicalParenteralBreakdown || '',
      pharmacologyBreakdown: q.pharmacologyBreakdown || '',
      safetyInfectionControlBreakdown: q.safetyInfectionControlBreakdown || '',
      psychosocialBreakdown: q.psychosocialBreakdown || '',
      healthPromotionBreakdown: q.healthPromotionBreakdown || '',
      pedrxStrategy: q.pedrxStrategy || '',
      clinicalPharmacologyBreakdown: q.clinicalPharmacologyBreakdown || null,
      topic: q.topic || titles[0],
      subtopic: q.subtopic || '',
      category: q.topic || titles[0]
    }));

    return { topicnames: titles, questions: finalQuestions };
  }

  if (isDailyDose) {
    // Serve Daily Dose questions from the seeded question bank (no AI generation)
    const subtopics = await subtopicModel.find({ topicId: { $in: topicIds } }).lean();

    if (subtopics.length === 0) {
      throw new Error("No subtopics found for the selected topics");
    }

    const subtopicIds = subtopics.map(s => s._id);

    let matchStage = { subTopic: { $in: subtopicIds } };

    if (questionType && questionType !== 'All') {
      matchStage.questionType = questionType;
    }

    const count = await QuestionModel.countDocuments(matchStage);
    if (count === 0) {
      throw new Error("No questions available for the selected topics. Please choose different topics.");
    }

    const sampleSize = Math.min(nofQuest, count);
    const questions = await QuestionModel.aggregate([
      { $match: matchStage },
      { $sample: { size: sampleSize } },
      { $lookup: { from: 'subtopics', localField: 'subTopic', foreignField: '_id', as: 'subtopicDoc' } },
      { $unwind: { path: '$subtopicDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'topics', localField: 'subtopicDoc.topicId', foreignField: '_id', as: 'topicDoc' } },
      { $unwind: { path: '$topicDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          question: 1,
          option: 1,
          correctAnswer: 1,
          questionType: 1,
          rationale: 1,
          whyIncorrect: 1,
          memoryTrick: 1,
          nclexTrap: 1,
          clinicalPearl: 1,
          optionEvaluations: 1,
          nclexConnection: 1,
          topic: '$topicDoc.title',
          subtopic: '$subtopicDoc.title'
        }
      }
    ]);

    const finalQuestions = questions.map(q => ({
      _id: q._id,
      question: q.question,
      option: q.option,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType || 'Single Choice',
      difficultyLevel: q.difficulty,
      rationale: q.rationale || '',
      whyIncorrect: q.whyIncorrect || '',
      memoryTrick: q.memoryTrick || '',
      nclexTrap: q.nclexTrap || '',
      clinicalPearl: q.clinicalPearl || '',
      optionEvaluations: q.optionEvaluations || [],
      nclexConnection: q.nclexConnection || '',
      topic: q.topic || titles[0],
      subtopic: q.subtopic || '',
      category: q.topic || titles[0]
    }));

    return { topicnames: titles, questions: finalQuestions };
  }

  const userDoc = await userModel.findById(userId);
  const attempted = userDoc.attemptedQuestions || [];

  // Fetch random questions from the database matching the criteria, excluding attempted
  let matchCriteria = { 
    selectedTopic: { $in: topicIds }, 
    difficultyLevel: difficulty,
    _id: { $nin: attempted }
  };
  
  if (questionType && questionType !== 'All') {
    matchCriteria.questionType = questionType;
  }

  let dbQuestions = await quizQuestionModel.aggregate([
    { $match: matchCriteria },
    { $sample: { size: parseInt(nofQuest) } }
  ]);

  // If no new questions found, we might have exhausted the bank. Reset attempted questions for these topics.
  if (dbQuestions.length === 0) {
    // Reset attempted questions for this user as a fallback (optional, could also just return an error)
    // For now, we fetch without $nin to allow them to keep practicing, but we'll try to get random
    let fallbackCriteria = { selectedTopic: { $in: topicIds }, difficultyLevel: difficulty };
    if (questionType && questionType !== 'All') {
      fallbackCriteria.questionType = questionType;
    }
    
    dbQuestions = await quizQuestionModel.aggregate([
      { $match: fallbackCriteria },
      { $sample: { size: parseInt(nofQuest) } }
    ]);
    
    if (dbQuestions.length === 0) {
      throw new Error("No pre-generated questions found for these topics and difficulty. Please ask an admin to generate the question bank.");
    }
  }

  const questionsForUser = dbQuestions.map(doc => ({
    _id: doc._id,
    question: doc.question,
    option: doc.option,
    correctAnswer: doc.correctAnswer,
    difficultyLevel: doc.difficultyLevel,
    questionType: doc.questionType,
    rationale: doc.rationale,
    keyTakeaway: doc.keyTakeaway,
    strategyTip: doc.strategyTip,
    category: doc.category
  }));

  return { topicnames: titles, questions: questionsForUser };
};

export const submitQuizService = async (answers, userId) => {
  const questionIds = answers.map(a => a.questionId);
  const dbQuestions = await quizQuestionModel.find({ _id: { $in: questionIds } });

  // Fallback: questions may also come from the seeded question bank (Daily Dose / Study Zone quizzes)
  if (dbQuestions.length < questionIds.length) {
    const foundIds = new Set(dbQuestions.map(q => q._id.toString()));
    const missingIds = questionIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      const seededQuestions = await QuestionModel.find({ _id: { $in: missingIds } });
      dbQuestions.push(...seededQuestions);
    }
  }

  const questionMap = new Map(dbQuestions.map(q => [q._id.toString(), q]));

  const allTopicIdStrings = dbQuestions.map(q => q.selectedTopic?.toString()).filter(Boolean);
  const distinctTopicIds = [...new Set(allTopicIdStrings)];

  let score = 0;
  const resultDetails = [];

  for (const answer of answers) {
    const dbQuestion = questionMap.get(answer.questionId);
    if (dbQuestion) {
      let isCorrect = false;
      
      if (dbQuestion.questionType === 'SATA') {
        let correctOptions;
        try {
            correctOptions = JSON.parse(dbQuestion.correctAnswer);
            if (!Array.isArray(correctOptions)) throw new Error("Not array");
        } catch(e) {
            correctOptions = dbQuestion.correctAnswer.split(',').map(s => s.trim()).filter(Boolean);
        }
        const userOptions = Array.isArray(answer.selectedOption) ? answer.selectedOption : answer.selectedOption.split(',').map(s => s.trim()).filter(Boolean);
        
        isCorrect = correctOptions.length === userOptions.length && correctOptions.every(opt => userOptions.includes(opt));
      } else {
        isCorrect = dbQuestion.correctAnswer === answer.selectedOption;
      }
      
      if (isCorrect) score++;

      resultDetails.push({
        questionId: dbQuestion._id,
        questionText: dbQuestion.question,
        userSelected: answer.selectedOption,
        correctOption: dbQuestion.correctAnswer,
        isCorrect: isCorrect,
        rationale: dbQuestion.rationale,
        keyTakeaway: dbQuestion.keyTakeaway,
        strategyTip: dbQuestion.strategyTip
      });
    }
  }

  const totalQuestions = answers.length;
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

  const newAttempt = await QuizAttemptModel.create({
    userId: userId,
    topicId: distinctTopicIds,
    score: score,
    totalQuestions: totalQuestions,
    percentage: percentage,
    details: resultDetails
  });

  // Update user's attempted questions and lifetime stats
  await userModel.findByIdAndUpdate(userId, {
    $addToSet: { attemptedQuestions: { $each: questionIds } },
    $inc: {
      lifetimeCorrectAnswers: score,
      lifetimeTotalQuestions: totalQuestions
    }
  });

  return {
    score,
    totalQuestions,
    percentage,
    results: resultDetails
  };
};
