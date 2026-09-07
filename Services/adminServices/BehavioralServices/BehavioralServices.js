import OpenAI from "openai";
import dotenv from "dotenv";
import BehavioralQuestionModel from "../../../Models/BehavioralQuestion.js";
import userModel from "../../../Models/userSchema.js";

dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const generateBehavioralBankService = async (topic, nofCases) => {
    if (!topic || !nofCases) {
        throw new Error("Missing required parameters for behavioral bank generation.");
    }

    const prompt = `
    SYSTEM ROLE: You are a psychiatric clinical instructor creating NCLEX scenarios for ${topic}.
    
    CORE OBJECTIVE:
    Generate ${nofCases} detailed unfolding case studies.
    
    OUTPUT FORMAT:
    You MUST return a JSON object containing a single key called "cases", which holds an array of the generated case objects.
    
    Each case object must match this structure exactly:
    {
        "clinicalScenario": "Detailed clinical scenario for the patient (e.g. History, Vitals, Presenting Problem)...",
        "questions": [
            {
                "questionText": "Question 1...",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswers": ["Correct Option text exactly as in options"],
                "rationale": "Detailed rationale for why this is correct and others are wrong."
            },
            {
                "questionText": "Question 2 (unfolding)...",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswers": ["Correct Option text exactly as in options"],
                "rationale": "Detailed rationale..."
            }
        ] // Include 3 to 4 questions per case study
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Faster and cheaper model
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You output strict JSON objects conforming to the exact schema requested." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
        });

        const parsedResponse = JSON.parse(completion.choices[0].message.content);
        const generatedCases = parsedResponse.cases || [];

        const insertDocs = generatedCases.map(c => ({
            topic: topic,
            clinicalScenario: c.clinicalScenario,
            questions: c.questions
        }));

        const savedDocs = await BehavioralQuestionModel.insertMany(insertDocs);
        return savedDocs;
    } catch (error) {
        console.error("Behavioral Batch error:", error);
        throw new Error("Failed to generate behavioral bank.");
    }
};

export const getBehavioralQuestionsService = async (topic, limit, userId) => {
    const userDoc = await userModel.findById(userId);
    const attempted = userDoc.attemptedQuestions || [];

    let cases = await BehavioralQuestionModel.aggregate([
        { $match: { topic, _id: { $nin: attempted } } },
        { $sample: { size: parseInt(limit) || 5 } }
    ]);

    if (cases.length === 0) {
        // Fallback
        cases = await BehavioralQuestionModel.aggregate([
            { $match: { topic } },
            { $sample: { size: parseInt(limit) || 5 } }
        ]);
    }

    if (cases.length > 0) {
        const caseIds = cases.map(c => c._id);
        await userModel.findByIdAndUpdate(userId, {
            $addToSet: { attemptedQuestions: { $each: caseIds } }
        });
    }

    return cases;
};

export const getBehavioralCountsService = async () => {
    const agg = await BehavioralQuestionModel.aggregate([
        {
            $group: {
                _id: "$topic",
                cases: { $sum: 1 },
                questions: { $sum: { $size: "$questions" } }
            }
        },
        { $project: { _id: 0, topic: "$_id", cases: 1, questions: 1 } }
    ]);
    return agg;
};
