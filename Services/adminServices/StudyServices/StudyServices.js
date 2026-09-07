import OpenAI from "openai";
import dotenv from "dotenv";
import quizQuestionModel from "../../../Models/quizQuestion.js";
import topicModel from "../../../Models/topicSchema.js";

dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const generateStudyBatch = async (batchSize, topicsString, difficulty) => {
    const prompt = `
    SYSTEM ROLE: You are PrepRX AI, the NCLEX-training engine.
    
    CORE OBJECTIVE:
    Generate ${batchSize} high-quality NCLEX-style multiple-choice questions mixed across these topics: "${topicsString}".
    
    HIERARCHY OF RULES:
    1. Safety First: Prioritize ABCs and Maslow.
    2. Difficulty Level: The questions should be rated as ${difficulty}.
    
    OUTPUT FORMAT:
    You MUST return a JSON object containing a single key called "questions", which holds an array of the generated question objects.
    
    Each question object must match this structure exactly:
    {
        "question": "Clinical scenario...",
        "options": ["Option text 1", "Option text 2", "Option text 3", "Option text 4"],
        "correctAnswer": "Exact text of correct option",
        "rationale": "Detailed explanation...",
        "keyTakeaway": "One sentence summary",
        "strategyTip": "Short tip",
        "difficulty": "${difficulty}",
        "relatedTopic": "Exact string of one of the input topics",
        "whyIncorrect": "Why other answers are wrong...",
        "memoryTrick": "Memory trick if applicable",
        "nclexTrap": "Common NCLEX trap if applicable",
        "primaryFramework": "Primary Framework used",
        "secondaryFramework": "Secondary Framework used if any",
        "optionEvaluations": [
            { "optionText": "Option text 1", "isTrue": false, "explanation": "..." }
        ]
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Faster model
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You output strict JSON objects." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
        });

        const parsedResponse = JSON.parse(completion.choices[0].message.content);
        return parsedResponse.questions || [];
    } catch (error) {
        console.error("Batch error:", error);
        return [];
    }
};

export const generateStudyBankService = async (topicId, difficulty, nofQuest) => {
    if (!topicId || !difficulty || !nofQuest) {
        throw new Error("Missing required parameters for study bank generation.");
    }

    const topicDoc = await topicModel.findById(topicId);
    if (!topicDoc) throw new Error("Topic not found");

    const CHUNK_SIZE = 10;
    const promises = [];
    let remainingQuestions = nofQuest;

    while (remainingQuestions > 0) {
        const countForThisBatch = Math.min(remainingQuestions, CHUNK_SIZE);
        promises.push(generateStudyBatch(countForThisBatch, topicDoc.title, difficulty));
        remainingQuestions -= countForThisBatch;
    }

    try {
        const resultsArray = await Promise.all(promises);
        const finalQuestions = resultsArray.flat();

        const insertDocs = finalQuestions.map(q => ({
            selectedTopic: topicDoc._id,
            question: q.question,
            option: q.options,
            correctAnswer: q.correctAnswer,
            difficultyLevel: difficulty,
            rationale: q.rationale,
            keyTakeaway: q.keyTakeaway,
            strategyTip: q.strategyTip,
            category: topicDoc.title
        }));

        const savedDocs = await quizQuestionModel.insertMany(insertDocs);
        return savedDocs;
    } catch (error) {
        console.error("Error generating study bank:", error);
        throw new Error("Failed to generate study bank.");
    }
};
