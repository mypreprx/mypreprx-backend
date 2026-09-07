import mongoose from "mongoose";
import userModel from "../../../Models/userSchema.js";
import QuizAttempt from "../../../Models/quizAttempt.js";
import MoodTracker from "../../../Models/DailyFeelingSchema.js";
import Flashcard from "../../../Models/flashCards.js";
import NclexAttempt from "../../../Models/nclexAttempt.js";
import QuizQuestion from "../../../Models/quizQuestion.js";
import QuestionFlag from "../../../Models/questionFlag.js";

// ---- Range resolution ----
const RANGE_DAYS = {
  "Last 7 Days": 7,
  "Last 30 Days": 30,
  "Last 90 Days": 90,
  "Academic Year 2026": 365,
};

const getRangeBounds = (range) => {
  const days = RANGE_DAYS[range] || 30;
  const now = new Date();

  let fromDate;
  if (range === "Academic Year 2026") {
    fromDate = new Date("2026-01-01T00:00:00.000Z");
  } else {
    fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
  }

  return { fromDate, toDate: now, days };
};

const dateStr = (d) => d.toISOString().split("T")[0];

// ---- Bucket generation for time series ----
const buildBuckets = (fromDate, toDate, days) => {
  const buckets = [];
  if (days <= 7) {
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const start = new Date(d);
      const end = new Date(start);
      buckets.push({
        start,
        end,
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        key: dateStr(start),
      });
    }
  } else if (days <= 90) {
    let cur = new Date(fromDate);
    while (cur <= toDate) {
      const start = new Date(cur);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      buckets.push({
        start,
        end,
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        key: dateStr(start),
      });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    while (cur <= toDate) {
      const start = new Date(cur);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      const label = `${start.toLocaleString("default", { month: "short" })} ${start.getFullYear()}`;
      buckets.push({ start, end, label, key: `${start.getFullYear()}-${start.getMonth()}` });
    }
  }
  return buckets;
};

const bucketIndexFor = (buckets, d) => {
  for (let i = 0; i < buckets.length; i++) {
    if (d >= buckets[i].start && d <= buckets[i].end) return i;
  }
  if (d < buckets[0]?.start) return 0;
  return buckets.length - 1;
};

// ---- Streak computation per user (based on MoodTracker) ----
const computeUserStreaks = (moodEntries) => {
  // moodEntries: [{ userId, date: 'YYYY-MM-DD' }]
  const byUser = {};
  for (const m of moodEntries) {
    (byUser[m.userId] ||= new Set()).add(m.date);
  }

  const now = new Date();
  const todayStr = dateStr(now);
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = dateStr(yest);

  const streaks = {};
  for (const [userId, dateSet] of Object.entries(byUser)) {
    const dates = [...dateSet].sort().reverse(); // newest first
    let streak = 0;
    if (dates.length && (dates[0] === todayStr || dates[0] === yesterdayStr)) {
      streak = 1;
      for (let i = 0; i < dates.length - 1; i++) {
        const cur = new Date(dates[i]);
        const prev = new Date(dates[i + 1]);
        const diff = Math.round(Math.abs(cur - prev) / (1000 * 60 * 60 * 24));
        if (diff === 1) streak++;
        else break;
      }
    }
    streaks[userId] = { streak, lastDate: dates[0] };
  }
  return streaks;
};

const daysSince = (dateStrVal) => {
  if (!dateStrVal) return null;
  const diff = Date.now() - new Date(dateStrVal).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const getAdminAnalyticsService = async (range = "Last 30 Days") => {
  const { fromDate, toDate, days } = getRangeBounds(range);

  // ============ CORE AGGREGATES ============
  const [
    totalStudents,
    attemptsInRange,
    moodsInRange,
    allMoods,
    topicAgg,
    flashcardCount,
    nclexCount,
    qbankCount,
  ] = await Promise.all([
    userModel.countDocuments({}),
    QuizAttempt.find({
      createdAt: { $gte: fromDate, $lte: toDate },
    }).lean(),
    MoodTracker.find({ date: { $gte: dateStr(fromDate) } }).select("userId date").lean(),
    MoodTracker.find({}).select("userId date").lean(),
    QuizAttempt.aggregate([
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      { $unwind: { path: "$topicId", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$topicId",
          attempts: { $sum: 1 },
          students: { $addToSet: "$userId" },
          avgPct: { $avg: "$percentage" },
          totalCorrect: { $sum: "$score" },
          totalQ: { $sum: "$totalQuestions" },
        },
      },
      {
        $lookup: {
          from: "topics",
          localField: "_id",
          foreignField: "_id",
          as: "topic",
        },
      },
      { $unwind: { path: "$topic", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          topic: { $ifNull: ["$topic.title", "Unknown Topic"] },
          attempts: 1,
          students: { $size: "$students" },
          accuracy: { $round: ["$avgPct", 0] },
        },
      },
    ]),
    Flashcard.countDocuments({ createdAt: { $gte: fromDate, $lte: toDate } }),
    NclexAttempt.countDocuments({ createdAt: { $gte: fromDate, $lte: toDate } }),
    QuizQuestion.countDocuments({}),
  ]);

  // ============ KPI VALUES ============
  const quizzesCompleted = attemptsInRange.length;
  const questionsAnswered = attemptsInRange.reduce((s, a) => s + (a.totalQuestions || 0), 0);
  const totalCorrect = attemptsInRange.reduce((s, a) => s + (a.score || 0), 0);
  const averageAccuracy =
    questionsAnswered === 0
      ? 0
      : Math.round((totalCorrect / questionsAnswered) * 100);
  const avgQuizScore =
    quizzesCompleted === 0
      ? 0
      : Math.round(
          attemptsInRange.reduce((s, a) => s + (a.percentage || 0), 0) / quizzesCompleted
        );

  const activeStudentsSet = new Set(moodsInRange.map((m) => String(m.userId)));
  const activeStudents = activeStudentsSet.size;

  // Avg study time per quiz attempt (from timestamps)
  let avgStudyTime = null;
  const durations = attemptsInRange
    .filter((a) => a.updatedAt && a.createdAt && new Date(a.updatedAt) > new Date(a.createdAt))
    .map((a) => (new Date(a.updatedAt) - new Date(a.createdAt)) / 1000);
  if (durations.length) {
    avgStudyTime = Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);
  }

  // Active streaks (users with current streak >= 1)
  const allStreaks = computeUserStreaks(allMoods);
  const activeStreaks = Object.values(allStreaks).filter((s) => s.streak >= 1).length;

  // ============ PREVIOUS PERIOD (for change %) ============
  const prevFrom = new Date(fromDate);
  prevFrom.setDate(prevFrom.getDate() - days);
  const prevTo = new Date(fromDate);

  const [prevAttempts, prevMoods] = await Promise.all([
    QuizAttempt.find({ createdAt: { $gte: prevFrom, $lte: prevTo } }).lean(),
    MoodTracker.find({ date: { $gte: dateStr(prevFrom), $lt: dateStr(prevTo) } })
      .select("userId")
      .lean(),
  ]);

  const prevQuizzes = prevAttempts.length;
  const prevQuestions = prevAttempts.reduce((s, a) => s + (a.totalQuestions || 0), 0);
  const prevCorrect = prevAttempts.reduce((s, a) => s + (a.score || 0), 0);
  const prevAccuracy = prevQuestions === 0 ? 0 : Math.round((prevCorrect / prevQuestions) * 100);
  const prevActiveStudents = new Set(prevMoods.map((m) => String(m.userId))).size;

  const pctChange = (cur, prev) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const kpis = [
    { key: "totalStudents", title: "Total Students", value: totalStudents.toLocaleString(), change: null, isPositive: true, subtitle: "Registered Accounts" },
    { key: "activeStudents", title: "Active Students", value: activeStudents.toLocaleString(), change: pctChange(activeStudents, prevActiveStudents), isPositive: pctChange(activeStudents, prevActiveStudents) >= 0, subtitle: "Active in period" },
    { key: "quizzesCompleted", title: "Quizzes Completed", value: quizzesCompleted.toLocaleString(), change: pctChange(quizzesCompleted, prevQuizzes), isPositive: pctChange(quizzesCompleted, prevQuizzes) >= 0, subtitle: "Completed tests" },
    { key: "questionsAnswered", title: "Questions Answered", value: questionsAnswered.toLocaleString(), change: pctChange(questionsAnswered, prevQuestions), isPositive: pctChange(questionsAnswered, prevQuestions) >= 0, subtitle: "Total attempts" },
    { key: "averageAccuracy", title: "Average Accuracy", value: `${averageAccuracy}%`, change: pctChange(averageAccuracy, prevAccuracy), isPositive: pctChange(averageAccuracy, prevAccuracy) >= 0, subtitle: "Overall accuracy" },
    { key: "avgStudyTime", title: "Avg Study Time", value: avgStudyTime ? `${Math.floor(avgStudyTime / 60)}m ${avgStudyTime % 60}s` : "—", change: null, isPositive: true, subtitle: "Avg session length" },
    { key: "activeStreaks", title: "Active Streaks", value: activeStreaks.toLocaleString(), change: null, isPositive: true, subtitle: "Maintaining streak" },
    { key: "avgQuizScore", title: "Avg Quiz Score", value: `${avgQuizScore} / 100`, change: null, isPositive: true, subtitle: "Across all quizzes" },
  ];

  // ============ TIME SERIES ============
  const buckets = buildBuckets(fromDate, toDate, days);
  const activity = buckets.map((b) => ({ period: b.label, activeStudents: 0, quizzes: 0 }));
  const perf = buckets.map((b) => ({ period: b.label, accuracy: 0, _q: 0, _c: 0 }));

  for (const m of moodsInRange) {
    const idx = bucketIndexFor(buckets, new Date(m.date));
    if (idx >= 0) activity[idx].activeStudents++;
  }
  for (const a of attemptsInRange) {
    const idx = bucketIndexFor(buckets, new Date(a.createdAt));
    if (idx >= 0) {
      activity[idx].quizzes++;
      perf[idx]._q += a.totalQuestions || 0;
      perf[idx]._c += a.score || 0;
    }
  }
  const performanceTrend = perf.map((p) => ({
    period: p.period,
    accuracy: p._q === 0 ? 0 : Math.round((p._c / p._q) * 100),
  }));

  // ============ STREAK DISTRIBUTION ============
  const distBuckets = [
    { name: "1–3 Days", min: 1, max: 3, value: 0 },
    { name: "4–7 Days", min: 4, max: 7, value: 0 },
    { name: "8–14 Days", min: 8, max: 14, value: 0 },
    { name: "15–30 Days", min: 15, max: 30, value: 0 },
    { name: "30+ Days", min: 31, max: Infinity, value: 0 },
  ];
  for (const s of Object.values(allStreaks)) {
    const b = distBuckets.find((d) => s.streak >= d.min && s.streak <= d.max);
    if (b) b.value++;
  }
  const streakDistribution = distBuckets.map(({ name, value }) => ({ name, value }));

  // ============ TOPICS ============
  const popularTopics = [...topicAgg]
    .sort((a, b) => b.attempts - a.attempts)
    .map((t) => ({ topic: t.topic, attempts: t.attempts, students: t.students }));

  const performanceByTopic = [...topicAgg]
    .sort((a, b) => b.accuracy - a.accuracy)
    .map((t) => ({ topic: t.topic, accuracy: t.accuracy }));

  // ============ DIFFICULT TOPICS (learning gaps) ============
  const attemptsArr = topicAgg.map((t) => t.attempts).sort((a, b) => a - b);
  const medianAttempts =
    attemptsArr.length % 2 === 0
      ? (attemptsArr[attemptsArr.length / 2 - 1] + attemptsArr[attemptsArr.length / 2]) / 2
      : attemptsArr[Math.floor(attemptsArr.length / 2)] || 0;

  const difficultTopics = topicAgg
    .map((t) => {
      const popular = t.attempts >= medianAttempts;
      let category, gapType, badge;
      if (t.accuracy < 50 && popular) {
        category = "High Pop + Low Acc";
        gapType = "High Priority Gap";
        badge = "high-gap";
      } else if (t.accuracy < 70 && popular) {
        category = "High Pop + Mid Acc";
        gapType = "Needs Reinforcement";
        badge = "mid-gap";
      } else if (t.accuracy < 50 && !popular) {
        category = "Low Pop + Low Acc";
        gapType = "Neglected & Hard";
        badge = "high-gap";
      } else {
        return null;
      }
      return {
        topic: t.topic,
        category,
        gapType,
        accuracy: `${t.accuracy}%`,
        attempts: t.attempts.toLocaleString(),
        fill: t.accuracy,
        badge,
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseInt(a.accuracy) - parseInt(b.accuracy))
    .slice(0, 5);

  // ============ STUDENTS NEEDING ATTENTION ============
  const userAgg = await QuizAttempt.aggregate([
    { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
    {
      $group: {
        _id: "$userId",
        attempts: { $sum: 1 },
        avgPct: { $avg: "$percentage" },
      },
    },
  ]);

  const riskStudents = userAgg
    .map((u) => {
      const streakInfo = allStreaks[String(u._id)] || { streak: 0, lastDate: null };
      const accuracy = Math.round(u.avgPct || 0);
      const staleDays = daysSince(streakInfo.lastDate);
      let level = "Low";
      if (accuracy < 50 || (staleDays !== null && staleDays > 21)) level = "High";
      else if (accuracy < 65 || (staleDays !== null && staleDays > 14)) level = "Medium";

      const riskPct =
        level === "High" ? 80 + Math.min(19, 100 - accuracy) : level === "Medium" ? 60 + Math.min(19, 80 - accuracy) : Math.max(5, accuracy - 40);

      return {
        name: String(u._id),
        userId: String(u._id),
        accuracy: `${accuracy}%`,
        accuracyNum: accuracy,
        dropoffRisk: `${level} (${Math.min(99, Math.round(riskPct))}%)`,
        streakLost: staleDays === null ? "No activity" : `${staleDays} Days Ago`,
        level,
      };
    })
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      return a.accuracyNum - b.accuracyNum;
    })
    .slice(0, 6);

  // Resolve usernames for risk students
  if (riskStudents.length) {
    const ids = riskStudents.map((r) => new mongoose.Types.ObjectId(r.userId));
    const users = await userModel.find({ _id: { $in: ids } }).select("username").lean();
    const nameMap = {};
    users.forEach((u) => (nameMap[String(u._id)] = u.username));
    riskStudents.forEach((r) => (r.name = nameMap[r.userId] || r.userId));
  }

  // ============ FEATURE USAGE (real proxies) ============
  // Timed Quizzes -> QuizAttempt, Spaced Flashcards -> Flashcard,
  // AI Diagnostic -> NclexAttempt (CAT), QBank Drills -> QBank size.
  const featureUsage = [
    { feature: "Timed Quizzes", count: quizzesCompleted },
    { feature: "Spaced Flashcards", count: flashcardCount },
    { feature: "QBank Drills", count: qbankCount },
    { feature: "AI Diagnostic", count: nclexCount },
  ];

  // ============ VISUALIZATION ROOM (real topic matrix) ============
  const visualizationRoom = {
    topics: topicAgg.map((t) => ({
      topic: t.topic,
      attempts: t.attempts,
      accuracy: t.accuracy,
    })),
  };

  // ============ AI QUESTION QUALITY ALERTS ============
  const flagDocs = await QuestionFlag.find({})
    .sort({ flags: -1, createdAt: -1 })
    .lean();
  const qualityAlerts = flagDocs.map((f) => ({
    id: f.questionId ? String(f.questionId) : "—",
    subject: f.subject,
    issue: f.issue,
    trigger: f.trigger,
    flags: f.flags,
    status: f.status,
  }));

  return {
    range,
    kpis,
    studentActivity: activity,
    performanceTrend,
    streakDistribution,
    popularTopics,
    performanceByTopic,
    difficultTopics,
    riskStudents,
    featureUsage,
    visualizationRoom,
    qualityAlerts,
    quizAnalytics: {
      generated: null,
      started: null,
      completed: quizzesCompleted,
      completionRate: null,
      avgScore: avgQuizScore,
      avgDurationSeconds: avgStudyTime,
      questionsAnswered,
    },
  };
};
