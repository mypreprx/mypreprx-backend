import OpenAI from "openai";

export const generateSubtopicsAI = async (mainTopicName) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY,});
  const prompt = `
    Act as a nursing education expert. 
    Break down the subject "${mainTopicName}" into 4 essential subtopics (lessons) for NCLEX preparation.
    For each subtopic, provide:
    1. A title.
    2. A brief educational summary (content).
    Output strictly valid JSON: { "subtopics": [{ "title": "...", "content": "..." }] }
  `;
  // ... (rest of the code matches previous logic)
  const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content).subtopics;
};
import { getDetailedPromptForSubtopic } from "./promptParser.js";

export const generateQuestionsAI = async (subtopicName, mainTopicName) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY,});
  
  const detailedPrompt = getDetailedPromptForSubtopic(mainTopicName, subtopicName);
  
  let systemInstructions = `SYSTEM ROLE: You are an expert NCLEX-RN tutor specializing in safe medication administration, clinical judgment, pharmacology concepts, medication decision-making, safety, and infection control.`;
  let moduleContext = ``;
  let formatRules = ``;

  if (detailedPrompt) {
    systemInstructions = detailedPrompt.tutorPersona;
    moduleContext = `
==================================================
MODULE CONTEXT & WHAT TO TEACH:
==================================================
${detailedPrompt.moduleTitle}
${detailedPrompt.moduleConcepts}
`;
    formatRules = `
==================================================
ADDITIONAL RULES & TARGET STRUCTURE:
==================================================
${detailedPrompt.generalRules}
`;
  }

  const prompt = `
    ${systemInstructions}
    
    CORE OBJECTIVE:
    Create 5 NCLEX-style multiple-choice questions for the subtopic: "${subtopicName}" (Parent Topic: "${mainTopicName}").
    Teach through understanding—not memorization.
    ${moduleContext}
    
    HIERARCHY OF RULES:
    1. Primary Framework: Patient Safety First (ABCs, Maslow, ADPIE).
    2. Focus on: WHY medications/treatments work, HOW to recognize complications/toxicity, and HOW to prevent errors.
    3. Every nursing action should answer: Is it safe? Does it reduce harm? Does it follow evidence-based guidelines?
    ${formatRules}

    CRITICAL INSTRUCTION FOR QUESTION GENERATION (OFFLINE MODE):
    Ignore any rules above that state "Wait for my answer" or "Do NOT reveal answers until I respond". 
    You are generating these questions for an offline database, so you MUST provide the question, the options, AND the correct answer, rationale, and breakdowns all at once in the JSON format below.

    Constraints:
    1. 'correctAnswer' must be the exact string text of the correct option.
    2. 'option' must be an array of 4 strings.
    3. You MUST provide a value for ALL fields below. Do NOT omit any fields. If a field seems difficult, invent a relevant memory trick, pearl, or trap based on the concept.
    
    Output strictly valid JSON exactly matching this structure: 
    { 
      "questions": [{ 
        "question": "...", 
        "option": [], 
        "correctAnswer": "...", 
        "rationale": "...",
        "whyIncorrect": "...",
        "memoryTrick": "REQUIRED: Provide a memory trick (mnemonic or association)",
        "nclexTrap": "REQUIRED: Describe a common NCLEX trap or pitfall for this topic",
        "primaryFramework": "Primary Framework used (e.g. Safety, Pharmacology)",
        "secondaryFramework": "Secondary Framework used if any",
        "clinicalPearl": "REQUIRED: Provide an important clinical pearl or nursing action",
        "clinicalPharmacologyBreakdown": {
            "drugConcept": "REQUIRED: Explain the core drug/topic concept",
            "whyItMatters": "REQUIRED: Why it matters clinically",
            "nclexSafetyPriority": "REQUIRED: The NCLEX safety priority",
            "patientTeaching": "REQUIRED: What to teach the patient",
            "labsToMonitor": "REQUIRED: Relevant labs (or 'N/A')",
            "majorSideEffects": "REQUIRED: Major side effects",
            "toxicitySigns": "REQUIRED: Signs of toxicity (or 'N/A')",
            "nursingActions": "REQUIRED: Critical nursing actions"
        },
        "optionEvaluations": [
            { "optionText": "...", "isTrue": false, "explanation": "..." }
        ]
      }] 
    }
  `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content).questions;
};