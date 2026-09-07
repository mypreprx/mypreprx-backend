import OpenAI from "openai";
import dotenv from "dotenv";
import DailyQuoteModel from "../../../Models/QuoteSchema.js";

dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Rotating themes so consecutive days always shift focus
const AFFIRMATION_THEMES = [
    "confidence and self-belief",
    "focus and concentration during study",
    "resilience after setbacks or missed questions",
    "calm and stress management on exam day",
    "purpose and becoming a compassionate nurse",
    "trusting your preparation and practice",
    "consistency and discipline in daily study",
    "growth mindset and learning from mistakes",
    "rest, energy, and physical well-being",
    "gratitude and a positive outlook on the journey",
];

const VARIED_OPENERS = [
    "Right now,",
    "Every question",
    "When I sit down to study,",
    "My preparation",
    "I choose",
    "With each practice block,",
    "Deep breath.",
    "One question at a time,",
    "My future patients",
    "Each morning",
];

export const getDailyAIAffirmationService = async (now = new Date()) => {
    // 1. Build today's date boundaries in UTC
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 2. Check if a quote already exists for TODAY specifically
    //    Sort by createdAt descending to always get the most recent one first
    const existingQuote = await DailyQuoteModel.findOne({
        createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    if (existingQuote) {
        return existingQuote;
    }

    // 3. Pull the most recent previous affirmation so we can explicitly guard against repeating it
    const previousQuote = await DailyQuoteModel.findOne({
        createdAt: { $lt: startOfDay }
    }).sort({ createdAt: -1 });

    // 4. Deterministically rotate the theme each UTC day so the focus always shifts
    const dayIndex = Math.floor(now.getTime() / 86400000);
    const theme = AFFIRMATION_THEMES[dayIndex % AFFIRMATION_THEMES.length];
    const suggestedOpener = VARIED_OPENERS[dayIndex % VARIED_OPENERS.length];

    const prompt = `
    You are an AI generating a daily morning affirmation for nursing students preparing for the NCLEX exam.

    TODAY'S THEME: ${theme}
    SUGGESTED OPENING (you may use it, but do not copy it verbatim): "${suggestedOpener}"

    Yesterday's affirmation was:
    "${previousQuote ? previousQuote.text : "None - this is the very first day"}"

    STRICT RULES:
    - Write 1-2 sentences that are positive, motivating, calming, and concrete, focused on ${theme}.
    - It MUST feel noticeably different from yesterday's affirmation. Do NOT reuse yesterday's opening phrase, structure, topic, or any distinctive wording.
    - Vary the opening and sentence structure every day. Do NOT start with "Today, I embrace" on ANY day.
    - Do not use quotes, markdown, emojis, or any symbols. Output only the raw affirmation text.
    Today's date: ${now.toISOString().split('T')[0]}
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You output short, warm, genuinely varied daily affirmations for nursing students. Every day must feel distinctly different from the previous day." },
                { role: "user", content: prompt }
            ],
            temperature: 1.0,
        });

        const generatedText = completion.choices[0].message.content.trim();

        // 5. Save today's new quote to DB
        const newQuote = await DailyQuoteModel.create({
            text: generatedText,
            date: now
        });

        return newQuote;
    } catch (error) {
        console.error("AI Affirmation Generation Error:", error);
        // Fallback quote if OpenAI call fails
        return { text: "You have everything it takes to pass the NCLEX. Trust your preparation and step into today with confidence." };
    }
};