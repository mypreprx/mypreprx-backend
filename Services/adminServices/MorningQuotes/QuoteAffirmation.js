import DailyQuote from "../../../Models/QuoteSchema.js";

// Fetch the latest quote from the DB
export const getLatestQuoteService = async () => {
  return await DailyQuote.findOne().sort({ createdAt: -1 });
};

export const getQuoteAllService = async () => {
  return await DailyQuote.find().sort({ createdAt: -1 });
};

// Create a new quote in the DB
export const createQuoteService = async (text) => {
  return await DailyQuote.create({ text });
};

// Update an existing quote by ID
export const updateQuoteService = async (id, data) => {
  // { new: true } returns the updated document instead of the old one
  return await DailyQuote.findByIdAndUpdate(id, data, { new: true });
};

// Delete a quote by ID
export const deleteQuoteService = async (id) => {
  return await DailyQuote.findByIdAndDelete(id);
};