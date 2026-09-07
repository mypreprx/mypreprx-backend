import mongoose from "mongoose";

const DailyQuoteSchema = new mongoose.Schema({
  text: { 
    type: String, 
    required: true,
    trim: true 
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

const DailyQuoteModel= mongoose.model("DailyQuote", DailyQuoteSchema);

export default DailyQuoteModel;