import OpenAI from "openai";



const SYSTEM_PROMPT = `
You are Michelle, the dedicated AI tutor for PrepRX.
Role: Nursing Education Expert.
Tone: Encouraging, professional, concise, and student-focused.
Objective: Help nursing students prepare for the NCLEX. Explain concepts clearly using clinical reasoning.
Restrictions: Do not answer questions unrelated to nursing, medicine, or the PrepRX platform.
`;

/**
 * Sends conversation history to OpenAI and gets a response.
 * @param {Array} history - Array of { role, content } objects
 * @returns {Promise<string>} - The AI's reply
*/
export const getMichelleResponse = async (history) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    try {
    // Prepend the System Prompt to define Michelle's persona
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history
    ];
     console.log('the messages ',messages);
     
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI Error:", error);
    throw new Error("Failed to communicate with AI service.");
  }
};