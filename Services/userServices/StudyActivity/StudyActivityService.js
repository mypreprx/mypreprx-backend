import StudyActivityModel from "../../../Models/studyActivitySchema.js";
import QuizAttempt from "../../../Models/quizAttempt.js";
import nclexAttemptModel from "../../../Models/nclexAttempt.js";
import userModel from "../../../Models/userSchema.js";
import Topic from "../../../Models/topicSchema.js";
import mongoose from "mongoose";

export const getUtcDateString = (date = new Date()) =>
  date.toISOString().split("T")[0];

/**
 * Upsert today's study day for the user.
 * When answerResult is provided, also updates lifetime question stats + QuizAttempt
 * so Progress / Treatment Plan questions, accuracy, mastery update.
 *
 * @param {string|ObjectId} userId
 * @param {string} source
 * @param {{ isCorrect?: boolean, questionId?: string, topicId?: string, topicTitle?: string, userAnswer?: string, timeSpentSeconds?: number }|null} answerResult
 */
export const recordStudyActivityService = async (
  userId,
  source = "study",
  answerResult = null
) => {
  if (!userId) throw new Error("User id is required");

  const date = getUtcDateString();
  const sourceTag = String(source || "study").slice(0, 64);

  const doc = await StudyActivityModel.findOneAndUpdate(
    { userId, date },
    {
      $inc: { activityCount: 1 },
      $addToSet: { sources: sourceTag },
      $setOnInsert: { userId, date },
    },
    { upsert: true, new: true }
  );

  // Optional: persist a scored answer for Progress metrics
  if (answerResult && typeof answerResult.isCorrect === "boolean") {
    const isCorrect = Boolean(answerResult.isCorrect);
    const questionId = answerResult.questionId;
    const update = {
      $inc: {
        lifetimeTotalQuestions: 1,
        lifetimeCorrectAnswers: isCorrect ? 1 : 0,
      },
    };
    if (questionId && mongoose.Types.ObjectId.isValid(questionId)) {
      update.$addToSet = { attemptedQuestions: questionId };
    }
    await userModel.findByIdAndUpdate(userId, update);

    let topicObjectId = null;
    if (answerResult.topicId && mongoose.Types.ObjectId.isValid(answerResult.topicId)) {
      topicObjectId = new mongoose.Types.ObjectId(answerResult.topicId);
    } else if (answerResult.topicTitle) {
      const topic = await Topic.findOne({
        title: new RegExp(`^${escapeRegex(String(answerResult.topicTitle).trim())}$`, "i"),
      })
        .select("_id")
        .lean();
      if (topic?._id) topicObjectId = topic._id;
    }

    const rawTime = Number(answerResult.timeSpentSeconds);
    const durationSeconds =
      Number.isFinite(rawTime) && rawTime > 0
        ? Math.min(Math.round(rawTime), 3600)
        : null;

    // One QuizAttempt per answered question so subject mastery / weak areas work
    await QuizAttempt.create({
      userId,
      topicId: topicObjectId ? [topicObjectId] : [],
      score: isCorrect ? 1 : 0,
      totalQuestions: 1,
      percentage: isCorrect ? 100 : 0,
      ...(durationSeconds != null ? { durationSeconds } : {}),
      details: questionId && mongoose.Types.ObjectId.isValid(questionId)
        ? [
            {
              questionId,
              userAnswer: answerResult.userAnswer || "",
              isCorrect,
            },
          ]
        : [],
    });
  }

  return doc;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Distinct study days from:
 * - StudyActivity (explicit logs from all zones)
 * - QuizAttempt.createdAt (custom / daily dose quizzes)
 * - nclexAttempt with at least one answered item
 */
export const getStudyActivityDatesService = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const dateSet = new Set();

  const studyDays = await StudyActivityModel.find({ userId: userObjectId })
    .select("date")
    .lean();
  studyDays.forEach((d) => {
    if (d.date) dateSet.add(String(d.date).slice(0, 10));
  });

  const quizDays = await QuizAttempt.aggregate([
    { $match: { userId: userObjectId } },
    {
      $project: {
        dateStr: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" },
        },
      },
    },
    { $group: { _id: "$dateStr" } },
  ]);
  quizDays.forEach((d) => {
    if (d._id) dateSet.add(d._id);
  });

  const nclexAttempts = await nclexAttemptModel
    .find({
      userId: userObjectId,
      "state.total_items_answered": { $gt: 0 },
    })
    .select("updatedAt createdAt history")
    .lean();

  nclexAttempts.forEach((attempt) => {
    const stamp = attempt.updatedAt || attempt.createdAt;
    if (stamp) dateSet.add(getUtcDateString(new Date(stamp)));
  });

  return [...dateSet].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
};

/**
 * Consecutive-day streak ending today or yesterday (UTC).
 */
export const computeStreakFromDates = (uniqueDatesDesc) => {
  if (!uniqueDatesDesc?.length) return 0;

  const todayStr = getUtcDateString();
  const yest = new Date();
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yesterdayStr = getUtcDateString(yest);

  if (uniqueDatesDesc[0] !== todayStr && uniqueDatesDesc[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  for (let i = 0; i < uniqueDatesDesc.length - 1; i++) {
    const current = new Date(`${uniqueDatesDesc[i]}T00:00:00.000Z`);
    const previous = new Date(`${uniqueDatesDesc[i + 1]}T00:00:00.000Z`);
    const diffDays = Math.round((current - previous) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) streak += 1;
    else break;
  }
  return streak;
};
