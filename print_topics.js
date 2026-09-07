import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const uri = process.env.MONGODB_URL;

const run = async () => {
  await mongoose.connect(uri);
  const topicsCollection = mongoose.connection.collection('topics');
  const topics = await topicsCollection.find({}).toArray();
  console.log(JSON.stringify(topics, null, 2));
  await mongoose.disconnect();
};

run();
