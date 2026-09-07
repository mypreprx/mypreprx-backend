import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const uri = process.env.MONGODB_URL;

const run = async () => {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB...");
    
    const db = mongoose.connection;
    const result = await db.collection('questions').deleteMany({});
    
    console.log(`Successfully deleted ${result.deletedCount} old questions!`);
    console.log("Next time you click any topic, it will generate brand new questions with all the correct fields.");
  } catch(e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
};
run();
