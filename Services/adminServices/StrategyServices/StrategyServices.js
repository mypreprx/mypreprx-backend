import OpenAI from "openai";
import dotenv from "dotenv";
import StrategyQuestionModel from "../../../Models/StrategyQuestion.js";
import userModel from "../../../Models/userSchema.js";

dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const generateStrategyBatch = async (batchSize, strategyTab, subCategory, promptInstructions) => {
    const prompt = `
    SYSTEM ROLE: You are an expert NCLEX-RN tutor specializing in ${strategyTab} (${subCategory}).
    
    CORE OBJECTIVE:
    Generate ${batchSize} high-quality NCLEX-style questions based exactly on these instructions:
    
    INSTRUCTIONS:
    ${promptInstructions}
    
    CRITICAL OVERRIDE:
    Some instructions above may say "Ask only ONE question at a time" or similar. YOU MUST IGNORE THAT RULE.
    You are an API endpoint. You MUST generate exactly ${batchSize} questions right now in a single JSON response.
    
    OUTPUT FORMAT:
    You MUST return a JSON object containing a single key called "questions", which holds an array of the generated question objects.
    
    Each question object must match this structure exactly:
    {
        "question": "Clinical scenario...",
        "options": ["Option text A", "Option text B", "Option text C", "Option text D"],
        "correctAnswers": ["Exact text of correct option(s)"],
        "difficultyLevel": "Beginner", // Or Intermediate, Advanced, NGN Case Study
        "rationale": "Detailed explanation...",
        "whyIncorrect": "Why other answers are wrong...",
        "memoryTrick": "Memory trick if applicable",
        "nclexTrap": "Common NCLEX trap if applicable",
        "primaryFramework": "Primary Framework used",
        "secondaryFramework": "Secondary Framework used if any",
        "cues": ["Cue 1", "Cue 2"], // If critical thinking
        "priorityRanking": ["1st", "2nd"], // If priority sorting
        "optionEvaluations": [ // If SATA
            { "optionText": "Option text A", "isTrue": true, "explanation": "..." }
        ]
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
        return parsedResponse.questions || [];
    } catch (error) {
        console.error("Strategy Batch error:", error);
        throw new Error("AI Generation Failed: " + error.message);
    }
};

export const generateStrategyBankService = async (strategyTab, subCategory, promptInstructions, nofQuest) => {
    if (!strategyTab || !nofQuest) {
        throw new Error("Missing required parameters for strategy bank generation.");
    }

    const CHUNK_SIZE = 5; // Generate 5 at a time
    const promises = [];
    let remainingQuestions = nofQuest;

    while (remainingQuestions > 0) {
        const countForThisBatch = Math.min(remainingQuestions, CHUNK_SIZE);
        promises.push(generateStrategyBatch(countForThisBatch, strategyTab, subCategory, promptInstructions));
        remainingQuestions -= countForThisBatch;
    }

    try {
        const resultsArray = await Promise.all(promises);
        const finalQuestions = resultsArray.flat();

        const insertDocs = finalQuestions.map(q => ({
            strategyTab,
            subCategory: subCategory || 'General',
            question: q.question,
            options: q.options,
            correctAnswers: q.correctAnswers,
            difficultyLevel: q.difficultyLevel || 'Intermediate',
            rationale: q.rationale,
            whyIncorrect: q.whyIncorrect,
            memoryTrick: q.memoryTrick,
            nclexTrap: q.nclexTrap,
            primaryFramework: q.primaryFramework,
            secondaryFramework: q.secondaryFramework,
            optionEvaluations: q.optionEvaluations,
            cues: q.cues,
            priorityRanking: q.priorityRanking
        }));

        const savedDocs = await StrategyQuestionModel.insertMany(insertDocs);
        return savedDocs;
    } catch (error) {
        console.error("Error generating strategy bank:", error);
        throw new Error("Failed to generate strategy bank.");
    }
};

// In-memory randomized decks per subCategory for the fixed question banks.
// Each deck is shuffled once per pass so each session gets randomized order + difficulty
// interleave, with no duplicate within a full pass. Reshuffles when the pass is exhausted.
const decks = {};

const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const mapBankDocToResponse = (d) => ({
    question: d.question,
    options: d.options,
    correctAnswers: d.correctAnswers,
    subCategory: d.subCategory,
    strategyTab: d.strategyTab,
    rationale: d.rationale,
    whyIncorrect: d.whyIncorrect,
    whySelectedCorrect: d.whySelectedCorrect,
    memoryTrick: d.memoryTrick,
    nclexTrap: d.nclexTrap,
    clinicalPearl: d.clinicalPearl,
    clinicalPharmacologyBreakdown: d.clinicalPharmacologyBreakdown,
    nclexConnection: d.nclexConnection,
    preprxTestTakingStrategy: d.preprxTestTakingStrategy,
    authoritativeReferenceValidation: d.authoritativeReferenceValidation,
    difficultyLevel: d.difficultyLevel,
    primaryFramework: d.primaryFramework,
    secondaryFramework: d.secondaryFramework
});

// Number of seeded questions for a bank. Used to decide whether a request must
// be served from the database instead of falling through to AI generation.
export const getStrategyBankCount = (subCategory) =>
    StrategyQuestionModel.countDocuments({ subCategory });

export const getStrategyBankQuestions = async (subCategory, batchSize = 5) => {
    const key = subCategory;
    if (!decks[key] || decks[key].deck.length === 0 || decks[key].pointer >= decks[key].deck.length) {
        const docs = await StrategyQuestionModel.find({
            subCategory
        }).lean();
        decks[key] = { deck: shuffleArray(docs), pointer: 0 };
    }

    const dk = decks[key];
    if (dk.deck.length - dk.pointer < batchSize) {
        // Not enough remaining in this pass; start a fresh randomized pass.
        dk.deck = shuffleArray(dk.deck);
        dk.pointer = 0;
    }

    const slice = dk.deck.slice(dk.pointer, dk.pointer + batchSize);
    dk.pointer += slice.length;

    return slice.map(mapBankDocToResponse);
};

// Backwards-compatible helper for the ABC bank.
export const getAbcBankQuestions = (batchSize = 5) =>
    getStrategyBankQuestions('ABC(Airway, Breathing, Circulation)', batchSize);

export const getStrategyQuestionsService = async (strategyTab, limit, userId, subCategory = null) => {
    // Load seeded strategy-bank questions from the database (never AI).
    const userDoc = await userModel.findById(userId);
    const attempted = userDoc.attemptedQuestions || [];
    const sampleSize = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 100);

    const baseMatch = { strategyTab };
    if (subCategory) baseMatch.subCategory = subCategory;

    let questions = await StrategyQuestionModel.aggregate([
        { $match: { ...baseMatch, _id: { $nin: attempted } } },
        { $sample: { size: sampleSize } },
    ]);

    if (questions.length === 0) {
        // Fallback if all are attempted — reshuffle from the bank
        questions = await StrategyQuestionModel.aggregate([
            { $match: baseMatch },
            { $sample: { size: sampleSize } },
        ]);
    }

    if (questions.length > 0) {
        const questionIds = questions.map((q) => q._id);
        await userModel.findByIdAndUpdate(userId, {
            $addToSet: { attemptedQuestions: { $each: questionIds } },
        });
    }

    return questions;
};
