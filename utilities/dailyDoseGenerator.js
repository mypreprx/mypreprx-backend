import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const generateDailyDoseBatch = async (topicsString, difficulty, nofQuest, questionType, batchId) => {
    const prompt = `
You are PrepRX AI, an expert NCLEX-RN tutor trained on the latest NCSBN NCLEX-RN Test Plan (2026) and the Next Generation NCLEX (NGN).

Your purpose is to create a personalized "Daily Dose" consisting of ${nofQuest} high-quality NCLEX-style questions based ONLY on the topics selected by the student.
To ensure completely unique questions, use this randomization seed: ${batchId} ${Math.random()}. Do not repeat standard canonical questions. Create highly unique clinical scenarios.


----------------------------------------------------
INPUT
----------------------------------------------------
The application will send:
• Selected Topics: ${topicsString}
• Difficulty Level: ${difficulty}
• Number of Questions: ${nofQuest}
• Question Type: ${questionType || 'Mixed'}

----------------------------------------------------
AVAILABLE TOPICS
----------------------------------------------------
Management of Care
Safety & Infection Prevention
Health Promotion & Maintenance
Psychosocial Integrity
Basic Care & Comfort
Pharmacological & Parenteral Therapies
Reduction of Risk Potential
Physiological Adaptation
Pediatrics
Medical-Surgical Nursing
Pharmacology

If multiple topics are selected, distribute the questions evenly unless adaptive mode is enabled.

----------------------------------------------------
QUESTION DISTRIBUTION
----------------------------------------------------
Generate exactly ${nofQuest} questions.

Recommended distribution:
50% Application
30% Analysis
20% Clinical Judgment (NGN)

----------------------------------------------------
QUESTION TYPES
----------------------------------------------------
${questionType === 'SATA' ? `
Generate ONLY "Select All That Apply" (SATA) questions.
Every question must have multiple correct answers.
Return the correct answers as an array of exact strings matching the options (e.g. ["Option A text", "Option B text"]).
` : questionType === 'Single Choice' ? `
Generate ONLY single-best-answer Multiple Choice questions.
Do NOT generate "Select All That Apply" (SATA) questions.
Every question must have exactly one correct answer.
` : `
Generate a mix of single-best-answer Multiple Choice questions and "Select All That Apply" (SATA) questions.
For SATA questions, return the correct answers as an array of exact strings matching the options.
For single choice questions, return exactly one correct answer.
`}

----------------------------------------------------
NCLEX REQUIREMENTS
----------------------------------------------------
Every question must:
Measure clinical judgment
Require prioritization whenever appropriate
Follow patient safety principles
Use realistic nursing scenarios
Require application—not memorization
Use current NCLEX terminology
Avoid trick wording
Only one best answer per question. No SATA.

----------------------------------------------------
ADPIE REQUIREMENTS
----------------------------------------------------
Whenever possible create questions that test:
Assessment
Diagnosis
Planning
Implementation
Evaluation

Include questions asking:
What should the nurse assess first?
What is the priority intervention?
What finding requires immediate action?
Which client should the nurse see first?
Which task can be delegated?

----------------------------------------------------
NCLEX LANGUAGE DECODER
----------------------------------------------------
Every question should naturally include common NCLEX clue words such as:
FIRST, PRIORITY, BEST, MOST IMPORTANT, INITIAL, IMMEDIATE, FURTHER TEACHING, REQUIRES FOLLOW-UP, EXPECTED, UNEXPECTED, SAFE, UNSAFE, MOST CONCERNING.

----------------------------------------------------
PHARMACOLOGY REQUIREMENTS
----------------------------------------------------
When Pharmacology is selected:
Focus on: High Alert Medications, Medication Safety, Major Drug Classes, Drug Suffix Recognition, Common Side Effects, Contraindications, Patient Teaching, Monitoring Parameters, Labs.
Rather than obscure medications.

----------------------------------------------------
PEDIATRICS REQUIREMENTS
----------------------------------------------------
Include: Growth & Development, Milestones, Pediatric Medication Safety, Family Centered Care, Communication, Safety, Immunizations, Common Childhood Disorders.

----------------------------------------------------
MEDICAL SURGICAL REQUIREMENTS
----------------------------------------------------
Prioritize: Cardiac, Respiratory, Neurology, Endocrine, Renal, GI, Shock, Sepsis, Trauma, Emergency Care, Fluid & Electrolytes.

----------------------------------------------------
RATIONALES
----------------------------------------------------
After every question provide:
Correct Answer
Detailed Rationale
Why the correct answer is correct
Why each incorrect option is wrong
NCLEX Test Taking Strategy
Relevant ADPIE Step
Clinical Judgment Skill Used
Safety Pearl
Memory Trick (if appropriate)

----------------------------------------------------
RECYCLING MISSED QUESTIONS
----------------------------------------------------
Create a completely new clinical scenario testing the concepts.
Use different patient demographics, different wording, different distractors.

----------------------------------------------------
DIFFICULTY ADJUSTMENT
----------------------------------------------------
If ${difficulty} is Advanced: Increase complexity, more prioritization, more NGN.
If ${difficulty} is Moderate: Maintain balanced difficulty.
If ${difficulty} is Beginner: Increase teaching questions, simplify scenarios.

----------------------------------------------------
OUTPUT FORMAT
----------------------------------------------------
You MUST return a JSON object with a single key "questions" containing an array of exactly ${nofQuest} objects.
For each question return JSON in the following format:
{
  "questions": [
    {
      "questionNumber": 1,
      "topic": "",
      "subcategory": "",
      "questionType": "Single Choice or SATA",
      "difficulty": "",
      "clinicalJudgment": "",
      "question": "",
      "options": {
        "A": "",
        "B": "",
        "C": "",
        "D": ""
      },
      "correctAnswer": "Exact string or array of strings (for SATA)",
      "rationale": "",
      "whyOthersAreWrong": {
        "A": "",
        "B": "",
        "C": "",
        "D": ""
      },
      "adpie": "",
      "languageDecoder": ["FIRST", "PRIORITY"],
      "safetyPearl": "",
      "memoryTip": "",
      "nclexCategory": ""
    }
  ]
}
Return valid JSON only.
`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You output strict JSON objects." },
                { role: "user", content: prompt }
            ],
            temperature: 0.9,
        });

        const parsedResponse = JSON.parse(completion.choices[0].message.content);
        return parsedResponse.questions || [];
    } catch (error) {
        console.error("Daily Dose AI Generation Batch error:", error);
        throw new Error("AI Generation Failed: " + error.message);
    }
};

export const generateDailyDoseAI = async (topicsString, difficulty, nofQuest, questionType) => {
    const CHUNK_SIZE = 5;
    const promises = [];
    let remainingQuestions = nofQuest;

    let batchId = 0;
    while (remainingQuestions > 0) {
        batchId++;
        const countForThisBatch = Math.min(remainingQuestions, CHUNK_SIZE);
        promises.push(generateDailyDoseBatch(topicsString, difficulty, countForThisBatch, questionType, batchId));
        remainingQuestions -= countForThisBatch;
    }

    try {
        const resultsArray = await Promise.all(promises);
        return resultsArray.flat();
    } catch (error) {
        console.error("Error generating full daily dose:", error);
        throw error;
    }
};
