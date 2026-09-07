import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const uri = process.env.MONGODB_URL;

const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String }
});
const Topic = mongoose.models.topic || mongoose.model('topic', topicSchema);

const PROMPT_FILE_PATH = path.join(__dirname, 'study zone (ALL TOPICs Tab).txt');

const topicMapping = {
  "safe medication administration, clinical judgment, pharmacology concepts, and medication decision-making": "Pharmacology",
  "Safety & Infection Control": "Safety & Infection Control",
  "Pediatric Nursing": "Pediatric Nursing",
  "Psychosocial Integrity": "Psychosocial Integrity",
  "Medical-Surgical Nursing": "Medical-Surgical Nursing",
  "Health Promotion & Maintenance": "Health Promotion & Maintenance",
  "Management of Care": "Management of Care",
  "Basic Care & Comfort": "Basic Care & Comfort",
  "Reduction of Risk Potential": "Reduction of Risk Potential",
  "Physiological Adaptation": "Physiological Adaptation",
  "Pharmacological & Parenteral Therapies": "Pharmacological & Parenteral Therapies"
};

const run = async () => {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    const content = fs.readFileSync(PROMPT_FILE_PATH, 'utf8');
    const parts = content.split(/You are an expert NCLEX-RN /i);
    const importData = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const specMatch = part.match(/^(?:Pharmacology\s+)?tutor\s+specializing\s+in\s+([^\.]+)\./i);
      if (!specMatch) continue;

      const specTitle = specMatch[1].trim();
      const mappedTopicTitle = topicMapping[specTitle] || specTitle;

      const topicDoc = await Topic.findOne({ title: new RegExp(`^${mappedTopicTitle}$`, 'i') });
      if (!topicDoc) {
        console.warn(`Topic not found in DB: ${mappedTopicTitle}`);
        continue;
      }

      const moduleParts = part.split(/MODULE (\d+)/i);
      for (let j = 1; j < moduleParts.length; j += 2) {
        const moduleText = moduleParts[j + 1] || '';

        const titleMatch = moduleText.match(/^\r?\n(.*?)\r?\n150 Questions/s);
        if (!titleMatch) continue;
        const rawTitle = titleMatch[1].trim().replace(/\r?\n/g, ' ');
        const subtopicTitle = rawTitle.replace(/\s+/g, ' ');

        let teachSection = "";
        const teachStart = moduleText.indexOf('Teach:');
        if (teachStart !== -1) {
          const searchEnd = moduleText.indexOf('==================================================', teachStart);
          const nextHeaderStart = moduleText.indexOf('High-Yield NCLEX Concepts:', teachStart);
          
          let endIdx = searchEnd;
          if (nextHeaderStart !== -1 && (endIdx === -1 || nextHeaderStart < endIdx)) {
            endIdx = nextHeaderStart;
          }
          
          if (endIdx !== -1) {
            teachSection = moduleText.substring(teachStart + 6, endIdx).trim();
          } else {
            teachSection = moduleText.substring(teachStart + 6).trim();
          }
        }

        const cleanContent = teachSection
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join(', ');

        const finalContent = cleanContent || `Study guides and practice questions for ${subtopicTitle}.`;

        // Format for MongoDB Atlas import
        importData.push({
          topicId: { "$oid": topicDoc._id.toString() },
          title: subtopicTitle,
          content: finalContent,
          createdAt: { "$date": new Date().toISOString() },
          updatedAt: { "$date": new Date().toISOString() }
        });
      }
    }

    fs.writeFileSync(path.join(__dirname, 'subtopics_to_import.json'), JSON.stringify(importData, null, 2));
    console.log("Successfully generated subtopics_to_import.json");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
};

run();
