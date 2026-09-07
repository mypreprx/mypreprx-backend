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
    const db = mongoose.connection;
    const topics = await db.collection('topics').find().toArray();
    console.log("Topics in DB:");
    for (const t of topics) {
      const subCount = await db.collection('subtopics').countDocuments({ topicId: t._id });
      console.log(`- ${t.title} (ID: ${t._id}) - ${subCount} lessons`);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
};
run();
