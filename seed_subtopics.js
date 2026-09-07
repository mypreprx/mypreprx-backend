import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const uri = process.env.MONGODB_URL;

if (!uri) {
  console.error("MONGODB_URL is not defined");
  process.exit(1);
}

// Schemas
const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String }
});
const Topic = mongoose.models.topic || mongoose.model('topic', topicSchema);

const subtopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'topic', required: true },
  title: { type: String, required: true },
  content: { type: String, required: true }
}, { timestamps: true });
const Subtopic = mongoose.models.subtopic || mongoose.model('subtopic', subtopicSchema);

const PROMPT_FILE_PATH = path.join(__dirname, 'study zone (ALL TOPICs Tab).txt');

// Map prompt specialization titles to MongoDB topic titles
const topicMapping = {
  "safe medication administration, clinical judgment, pharmacology concepts, and medication decision-making": "Pharmacology",
  "Safety & Infection Control": "Safety & infection control",
  "Pediatric Nursing": "Pediatrics",
  "Psychosocial Integrity": "Psychosocial Integrity",
  "Medical-Surgical Nursing": "Med-Surg",
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
    console.log("Connected to MongoDB successfully.");

    if (!fs.existsSync(PROMPT_FILE_PATH)) {
      console.error(`Prompt file not found at: ${PROMPT_FILE_PATH}`);
      process.exit(1);
    }

    const content = fs.readFileSync(PROMPT_FILE_PATH, 'utf8');

    // Parse the file into topic parts
    const parts = content.split(/You are an expert NCLEX-RN /i);
    console.log(`Found ${parts.length - 1} topic sections in prompt file.`);

    const seededSubtopics = [];

    // Clear existing subtopics first
    await Subtopic.deleteMany({});
    console.log("Cleared existing subtopics.");

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const specMatch = part.match(/^(?:Pharmacology\s+)?tutor\s+specializing\s+in\s+([^\.]+)\./i);
      if (!specMatch) continue;

      const specTitle = specMatch[1].trim();
      const mappedTopicTitle = topicMapping[specTitle] || specTitle;

      // Find or create topic in DB
      let topicDoc = await Topic.findOne({ title: new RegExp(`^${mappedTopicTitle}$`, 'i') });
      if (!topicDoc) {
        topicDoc = await Topic.create({
          title: mappedTopicTitle,
          description: `NCLEX Prep domain for ${mappedTopicTitle}`
        });
        console.log(`Created new Topic in DB: "${mappedTopicTitle}"`);
      }

      // Find modules
      const moduleParts = part.split(/MODULE (\d+)/i);
      // moduleParts looks like: [preamble, "1", "module1text", "2", "module2text", ...]
      for (let j = 1; j < moduleParts.length; j += 2) {
        const moduleNum = moduleParts[j];
        const moduleText = moduleParts[j + 1] || '';

        // Extract Title: lines up to "150 Questions"
        const titleMatch = moduleText.match(/^\r?\n(.*?)\r?\n150 Questions/s);
        if (!titleMatch) continue;
        const rawTitle = titleMatch[1].trim().replace(/\r?\n/g, ' ');
        const subtopicTitle = rawTitle.replace(/\s+/g, ' ');

        // Extract Teach concepts for content
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

        // Cleanup teach section list to readable format
        const cleanContent = teachSection
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join(', ');

        const finalContent = cleanContent || `Study guides and practice questions for ${subtopicTitle}.`;

        const newSubtopic = await Subtopic.create({
          topicId: topicDoc._id,
          title: subtopicTitle,
          content: finalContent
        });

        console.log(`Seeded subtopic: "${subtopicTitle}" under topic "${topicDoc.title}"`);
        seededSubtopics.push(newSubtopic);
      }
    }

    console.log(`Seeding completed successfully. Seeded ${seededSubtopics.length} subtopics.`);

    // Cleanup topics that have 0 subtopics
    console.log("Cleaning up topics with 0 lessons...");
    const allTopics = await Topic.find({});
    for (const t of allTopics) {
      const count = await Subtopic.countDocuments({ topicId: t._id });
      if (count === 0) {
        await Topic.findByIdAndDelete(t._id);
        console.log(`Deleted empty topic: "${t.title}"`);
      }
    }
    console.log("Cleanup complete.");

  } catch (error) {
    console.error("Seeding error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
};

run();
