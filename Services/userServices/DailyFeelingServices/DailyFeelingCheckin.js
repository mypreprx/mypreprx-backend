import MoodTrackerModel from '../../../Models/DailyFeelingSchema.js';

// Helper to get today's date string (YYYY-MM-DD)
const getTodayString = () => new Date().toISOString().split('T')[0];

export const logDailyMood = async (userId, moodValue) => {
    const dateStr = getTodayString();
    const getMoodLabel = (value) => {
        if (value <= 30) return "Stressed";
        if (value >= 70) return "Relaxed";
        return "Neutral";
    };
    try {
        // Try to create the new entry
        const newLog = await MoodTrackerModel.create({
            userId,
            date: dateStr,
            moodValue,
            label:getMoodLabel(moodValue)
        });
        return { success: true, data: newLog };
    } catch (error) {
        // If error code is 11000, it means the user already posted today
        if (error.code === 11000) {
            throw new Error("You have already checked in today. See you tomorrow!");
        }
        throw error;
    }
};

export const getStreakAndHistory = async (userId) => {
    // Fetch all logs for this user, sorted by newest first
    const logs = await MoodTrackerModel.find({ userId }).sort({ date: -1 });

    // --- Calculate Streak ---
    let currentStreak = 0;
    const todayStr = getTodayString();

    // Create a date object for iteration
    let checkDate = new Date();

    // Check if user logged today
    const hasLoggedToday = logs.some(log => log.date === todayStr);

    // If they haven't logged today yet, we start checking from yesterday to see if the streak is still alive
    if (!hasLoggedToday) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // Loop backwards to count consecutive days
    while (true) {
        const dateString = checkDate.toISOString().split('T')[0];
        const logFound = logs.find(l => l.date === dateString);

        if (logFound) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1); // Go back one day
        } else {
            break; // Streak is broken
        }
    }

    return {
        currentStreak,
        hasLoggedToday,
        history: logs.slice(0, 7) // Return last 7 entries for the graph
    };
};