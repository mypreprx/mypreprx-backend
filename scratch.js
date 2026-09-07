import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected to MongoDB");

        const QuizAttemptModel = mongoose.model('QuizAttempt', new mongoose.Schema({
            userId: mongoose.Schema.Types.ObjectId,
            topicId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'topic' }],
            score: Number,
            totalQuestions: Number,
            percentage: Number
        }, { collection: 'quizattempts' }));

        const topicModel = mongoose.model('topic', new mongoose.Schema({
            title: String
        }, { collection: 'topics' }));
        
        // Find one user who has attempts
        const sampleAttempt = await QuizAttemptModel.findOne({});
        if (!sampleAttempt) {
            console.log("No quiz attempts found");
            return;
        }
        console.log("Sample attempt:", sampleAttempt);
        const userObjectId = sampleAttempt.userId;

        const subjectMasteryRaw = await QuizAttemptModel.aggregate([
            { $match: { userId: userObjectId } },
            { $unwind: "$topicId" },
            {
              $group: {
                _id: "$topicId",
                avgScore: { $avg: "$percentage" }
              }
            },
            { $sort: { avgScore: -1 } },
            { $limit: 4 },
            {
              $project: {
                topicId: "$_id",
                mastery: { $round: ["$avgScore", 0] }
              }
            }
          ]);
        console.log("Subject Mastery Raw:", subjectMasteryRaw);

        for (const item of subjectMasteryRaw) {
            console.log("Querying topic with ID:", item.topicId);
            const topic = await topicModel.findById(item.topicId);
            console.log("Found topic:", topic);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
