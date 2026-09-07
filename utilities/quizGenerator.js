import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to handle a single parallel batch
const generateBatch = async (batchSize, topicsString, difficulty, questionType) => {
    const prompt = `
    SYSTEM ROLE: You are PrepRX AI, an expert NCLEX-RN tutor built using the official 2026 NCSBN NCLEX Test Plan.
    Your purpose is to generate completely customized NCLEX exams based entirely on the user's selected study preferences.
    These quizzes must use the exact same NCLEX format, rationale structure, adaptive learning system, flashcards, remediation, clinical judgment breakdown, and mastery reporting used throughout the PrepRX platform.
    Never simplify explanations because this is a custom quiz. Always maintain the full educational experience.
    
    CORE OBJECTIVE:
    Generate ${batchSize} high-quality, UNIQUE NCLEX-style multiple-choice questions mixed across these topics: "${topicsString}".
    All questions MUST be distinct — do NOT repeat or paraphrase each other.
    Questions MUST ONLY come from the selected topics.
    
    HIERARCHY OF RULES:
    1. Difficulty Level: The questions should be rated as ${difficulty}.
       - EASY: Knowledge recall, basic nursing care, simple prioritization, straightforward pharmacology, few distractors.
       - MODERATE: Standard NCLEX, prioritization, clinical judgment, assessment, patient education, medication safety.
       - HARD: Expert NCLEX, multiple disease processes, complications, complex prioritization, delegation, advanced NGN, critical care thinking, clinical deterioration.
    2. Question Type: ${questionType === 'SATA' ? 'Generate ONLY "Select All That Apply" (SATA) questions with multiple correct options.' : questionType === 'Single Choice' ? 'Generate ONLY single-choice questions with exactly one correct option.' : 'Mix single-choice and SATA questions according to NCLEX blueprint.'}
    3. Quality: Follow the official NCLEX Test Plan, use evidence-based nursing, require clinical reasoning, and avoid trivia.
    4. Every question MUST follow the official NCLEX Test plan, require clinical reasoning and prioritization, avoid memorization-only questions, and focus on safe nursing practice.
    
    CRITICAL RULES FOR correctAnswer FIELD:
    - For Single Choice questions: correctAnswer MUST be a plain string with the EXACT text of the one correct option.
    - For SATA questions: correctAnswer MUST be a JSON array of strings, each being the EXACT text of a correct option. NEVER use a comma-separated string for SATA. ALWAYS use a proper JSON array.
    
    OUTPUT FORMAT:
    You MUST return a JSON object containing a single key called "questions", which holds an array of the generated question objects.
    You MUST provide a value for ALL fields below. Do NOT omit any fields. If a field seems difficult, invent a relevant memory trick, pearl, or trap based on the concept.
    
    Each question object must match this structure exactly:
    {
        "topic": "The main topic this falls under",
        "subtopic": "The specific subtopic",
        "difficulty": "${difficulty}",
        "estimatedTime": "Estimated time to answer in seconds (e.g. 60)",
        "clientNeedsCategory": "NCLEX Client Needs Category",
        "questionType": "Single Choice or SATA",
        "question": "Clinical scenario...",
        "option": ["Option text 1", "Option text 2", "Option text 3", "Option text 4", "(add more if SATA)"],
        "correctAnswer": "String for Single Choice OR JSON array for SATA",
        "rationale": "Detailed explanation...",
        "whyIncorrect": "Why every incorrect option is wrong...",
        "safetyPearl": "REQUIRED: Safety Pearl",
        "memoryTrick": "REQUIRED: Memory Trick",
        "clinicalPearl": "REQUIRED: Clinical Pearl",
        "nclexTrap": "REQUIRED: NCLEX Trap",
        "primaryFramework": "REQUIRED: Primary Framework (ABCs, Maslow, ADPIE, Safety, Clinical Judgment, Delegation, or Priority)",
        "secondaryFramework": "Secondary Framework if applicable",
        "clinicalJudgmentDomain": "e.g. Recognize Cues, Analyze Cues, Prioritize, etc.",
        "clinicalJudgmentBreakdown": {
            "assessment": "REQUIRED: Assessment details",
            "cueRecognition": "REQUIRED: Cue Recognition",
            "cueAnalysis": "REQUIRED: Cue Analysis",
            "priorityProblem": "REQUIRED: Priority Problem",
            "nursingIntervention": "REQUIRED: Nursing Intervention",
            "medicationConsiderations": "REQUIRED: Medication Considerations",
            "outcomeEvaluation": "REQUIRED: Outcome Evaluation"
        },
        "optionEvaluations": [
            { "optionText": "Option text 1", "isTrue": false, "explanation": "..." }
        ]
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Faster model
            response_format: { type: "json_object" }, // Native JSON speedup
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
        throw new Error("AI Generation Failed: " + error.message);
    }
};

const generatequiz = async (topicNames, nofQuest, difficulty, questionType) => {
    const topicsString = Array.isArray(topicNames) ? topicNames.join(", ") : topicNames;

    // Determine how to chunk the parallel requests
    const CHUNK_SIZE = 3;
    const promises = [];
    let remainingQuestions = nofQuest;

    // Create the parallel requests
    while (remainingQuestions > 0) {
        const countForThisBatch = Math.min(remainingQuestions, CHUNK_SIZE);
        promises.push(generateBatch(countForThisBatch, topicsString, difficulty, questionType));
        remainingQuestions -= countForThisBatch;
    }

    try {
        // Execute all requests concurrently
        const resultsArray = await Promise.all(promises);

        // Flatten the array of arrays into a single array of questions
        const allQuestions = resultsArray.flat();

        // Deduplicate questions by their text to prevent repeats across batches
        const seen = new Set();
        const finalQuizQuestions = allQuestions.filter(q => {
            const key = q.question?.toLowerCase().trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return JSON.stringify(finalQuizQuestions);
    } catch (error) {
        console.error("Error generating full quiz:", error);
        return "[]";
    }
}

export default generatequiz;