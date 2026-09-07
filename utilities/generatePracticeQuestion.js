import OpenAI from "openai";
export const generateCaseStudyAI = async (subTopicName, mainTopicName) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
    You are PrepRX AI, the NCLEX-training engine. 
    Generate 1 complete Next Generation NCLEX (NGN) Case Study set.
    
    Topic: "${subTopicName}"
    Context: "${mainTopicName}"

    MANDATORY STRUCTURE:
    1. **Patient Chart**: Must include age, gender, chief complaint, history, vitals, assessment, orders, and labs.
    2. **6 Linked Questions**: Must strictly follow the 6-step Clinical Judgment Measurement Model (CJM):
       - Step 1: Recognize Cues
       - Step 2: Analyze Cues
       - Step 3: Prioritize Hypotheses
       - Step 4: Generate Solutions
       - Step 5: Take Action
       - Step 6: Evaluate Outcomes
    3. **Content**: High-acuity, exam-level difficulty.
    
    OUTPUT FORMAT:
    Strictly valid JSON with this exact schema:
    {
      "title": "Case Study Title",
      "difficulty": "Advanced",
      "patientChart": {
        "age": "Number",
        "gender": "String",
        "chiefComplaint": "String",
        "history": "String",
        "homeMeds": "String",
        "vitals": "String (Initial)",
        "assessment": "String (Focused)",
        "orders": "String (Initial)",
        "labs": "String (Abnormal values)",
        "providerImpression": "String"
      },
      "scenarioNarrative": "STRING A 54-year-old male presents to the ED... (Full clinical story here)",
      "questions": [
        {
          "step": 1, 
          "cjmStage": "Recognize Cues",
          "questionType": "multiple_choice", 
          "questionText": "...",
          "options": ["...", "...", "...", "..."], 
          "correctAnswer": "...", 
          "rationale": "...",
          "distractorExplanation": "Why others are wrong/unsafe",
          "keyTakeaway": "One sentence summary",
          "strategyTip": "Exam tip"
        }
        // ... Ensure exactly 6 questions total, numbered 1-6
      ]
    }
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use GPT-4 for Case Studies (Complex logic requires it)
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("AI Case Study Error:", error);
    throw new Error("Failed to generate case study.");
  }
};