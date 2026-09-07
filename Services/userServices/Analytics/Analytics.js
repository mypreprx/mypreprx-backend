import mongoose from "mongoose";
import QuizAttempt from "../../../Models/quizAttempt.js";
import MoodTracker from "../../../Models/DailyFeelingSchema.js";
import Topic from "../../../Models/topicSchema.js";
import userModel from "../../../Models/userSchema.js";

export const getDashboardAnalyticsService = async (userId) => {

  const userObjectId = new mongoose.Types.ObjectId(userId);
  
  // Fetch user doc for lifetime stats
  const userDoc = await userModel.findById(userId).select('lifetimeCorrectAnswers lifetimeTotalQuestions');
  const lifetimeCorrectAnswers = userDoc?.lifetimeCorrectAnswers ?? 0;
  const lifetimeTotalQuestions = userDoc?.lifetimeTotalQuestions ?? 0;

  /* ---------------- 1. OVERALL PROGRESS & TOTALS ---------------- */
  const attempts = await QuizAttempt.find({ userId: userObjectId });

  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalDurationSeconds = 0;
  let totalDurationQuestions = 0;

  attempts.forEach(a => {
    totalQuestions += a.totalQuestions;
    totalCorrect += a.score;

    if (a.createdAt && a.updatedAt && a.updatedAt > a.createdAt) {
      const durationSeconds = (a.updatedAt.getTime() - a.createdAt.getTime()) / 1000;
      totalDurationSeconds += durationSeconds;
      totalDurationQuestions += a.totalQuestions;
    }
  });

  const overallProgress =
    totalQuestions === 0
      ? 0
      : Math.round((totalCorrect / totalQuestions) * 100);

  const averageTimePerQuestion =
    totalDurationQuestions === 0
      ? null
      : Math.round(totalDurationSeconds / totalDurationQuestions);


  /* ---------------- 2. TOP 4 SUBJECT MASTERY (Updated) ---------------- */
  // We added $sort and $limit to get the "Top 4" specifically

  const subjectMasteryRaw = await QuizAttempt.aggregate([
    { $match: { userId: userObjectId } },
    { $unwind: { path: "$topicId", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        percentage: 1,
        // Handle cases where topicId might be an object { type: ObjectId } due to schema definition
        actualTopicId: {
          $cond: {
            if: { $eq: [{ $type: "$topicId" }, "object"] },
            then: { $ifNull: ["$topicId._id", { $ifNull: ["$topicId.type", "$topicId"] }] },
            else: "$topicId"
          }
        }
      }
    },
    {
      $group: {
        _id: "$actualTopicId",
        avgScore: { $avg: "$percentage" },
        firstAttemptId: { $first: "$_id" }
      }
    },
    { $sort: { avgScore: -1 } },
    { $limit: 4 },
    {
      $lookup: {
        from: "topics", 
        localField: "_id",
        foreignField: "_id",
        as: "topicDetails"
      }
    },
    {
      $unwind: {
        path: "$topicDetails",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        topicId: "$_id",
        topicTitle: "$topicDetails.title",
        mastery: { $round: ["$avgScore", 0] },
        firstAttemptId: 1
      }
    }
  ]);

  const subjectMastery = await Promise.all(
    subjectMasteryRaw.map(async (item) => {
      let title = item.topicTitle;
      let finalTopicId = item.topicId;
      
      // Fallback: If topic was deleted (orphaned ID), try to get the category from the answered questions
      if (!title) {
        try {
          const attempt = await QuizAttempt.findById(item.firstAttemptId).populate('details.questionId');
          if (attempt && attempt.details && attempt.details.length > 0) {
            const firstValidQuestion = attempt.details.find(d => d.questionId && d.questionId.category);
            if (firstValidQuestion) {
              title = firstValidQuestion.questionId.category;
              // Heal the orphaned ID by finding the new topic with this title
              const newTopic = await mongoose.model("topic").findOne({ title: title });
              if (newTopic) {
                  finalTopicId = newTopic._id;
              }
            }
          }
        } catch (e) {
          console.error("Fallback topic lookup failed", e);
        }
      }

      return {
        topicId: finalTopicId,
        topicTitle: title || "Unknown Topic",
        mastery: item.mastery
      };
    })
  );


  /* ---------------- 3. WEAK AREAS ---------------- */
  
  const weakAreasRaw = await QuizAttempt.aggregate([
    { $match: { userId: userObjectId } },
    { $unwind: { path: "$topicId", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        percentage: 1,
        actualTopicId: {
          $cond: {
            if: { $eq: [{ $type: "$topicId" }, "object"] },
            then: { $ifNull: ["$topicId._id", { $ifNull: ["$topicId.type", "$topicId"] }] },
            else: "$topicId"
          }
        }
      }
    },
    {
      $group: {
        _id: "$actualTopicId",
        avgScore: { $avg: "$percentage" },
        firstAttemptId: { $first: "$_id" }
      }
    },
    { $sort: { avgScore: 1 } },
    { $limit: 3 },
    {
      $lookup: {
        from: "topics",
        localField: "_id",
        foreignField: "_id",
        as: "topicDetails"
      }
    },
    {
      $unwind: {
        path: "$topicDetails",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        topicId: "$_id",
        topicTitle: "$topicDetails.title",
        mastery: { $round: ["$avgScore", 0] },
        firstAttemptId: 1
      }
    }
  ]);

  const weakAreas = await Promise.all(
    weakAreasRaw.map(async (item) => {
      let title = item.topicTitle;
      let finalTopicId = item.topicId;
      
      if (!title) {
        try {
          const attempt = await QuizAttempt.findById(item.firstAttemptId).populate('details.questionId');
          if (attempt && attempt.details && attempt.details.length > 0) {
            const firstValidQuestion = attempt.details.find(d => d.questionId && d.questionId.category);
            if (firstValidQuestion) {
              title = firstValidQuestion.questionId.category;
              const newTopic = await mongoose.model("topic").findOne({ title: title });
              if (newTopic) {
                  finalTopicId = newTopic._id;
              }
            }
          }
        } catch (e) {
          console.error("Fallback topic lookup failed", e);
        }
      }

      return {
        topicId: finalTopicId,
        topicTitle: title || "Unknown Topic",
        mastery: item.mastery
      };
    })
  );


  /* ---------------- 4. MOOD GRAPH ---------------- */

  const moods = await MoodTracker.find({ userId: userObjectId })
    .sort({ date: 1 })
    .select("date moodValue");

  const getMoodLabel = (value) => {
    if (value <= 30) return "Relaxed";
    if (value >= 70) return "Stressed";
    return "Neutral";
  };

  const moodGraph = moods.map(m => ({
    date: m.date,
    value: m.moodValue, 
    label: getMoodLabel(m.moodValue)
  }));


  /* ---------------- 5. STUDY STREAK (Login Based) ---------------- */

  const moodDates = await MoodTracker.aggregate([
    { $match: { userId : userObjectId} },
    {
      $project: {
        dateStr: { $cond: {
                if: { $eq: [{ $type: "$date" }, "string"] },
                then: "$date", // If it's already a string "2026-02-04", keep it
                else: { $dateToString: { format: "%Y-%m-%d", date: "$date" } } // If it's a Date object, convert it
             } }
      }
    },
    { $group: { _id: "$dateStr" } },
    { $sort: { _id: -1 } }
  ]);

  const uniqueDates = moodDates.map(d => d._id);

  let streak = 0;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = yest.toISOString().split('T')[0];

  if (uniqueDates.length > 0 && (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr)) {
    streak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const current = new Date(uniqueDates[i]);
      const previous = new Date(uniqueDates[i+1]);
      const diffTime = Math.abs(current - previous);
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) streak++;
      else break;
    }
  }


  /* ---------------- FINAL RESPONSE (Matched to your list) ---------------- */

  return {
    overallProgress,
    streak,
    totalQuestions,
    lifetimeCorrectAnswers,
    lifetimeTotalQuestions,
    subjectMastery,
    moodGraph,
    weakAreas,
    averageTimePerQuestion,
    questionAnalytics: {
      totalQuestions,
      correctAnswers: totalCorrect,
      lifetimeCorrectAnswers,
      accuracy: overallProgress,
      averageTimePerQuestion
    }
  };
};