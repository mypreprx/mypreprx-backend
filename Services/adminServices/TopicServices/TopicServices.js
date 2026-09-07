import topicModel from '../../../Models/topicSchema.js';
import subtopicModel from '../../../Models/subTopicSchema.js';
import {generateSubtopicsAI,generateQuestionsAI} from '../../../utilities/subTopic&Question.js'
// --- SERVICE 1: Handle Subtopic Generation ---
export const generateSubtopicsService = async (mainTopicName) => {
  let topic = await topicModel.findOne({ title: mainTopicName });

  if (!topic) {
    topic = await topicModel.create({
      title: mainTopicName,
      description: `AI-generated course for ${mainTopicName}`,
    });
  }

  const aiSubtopics = await generateSubtopicsAI(mainTopicName);

  return {
    topicId: topic._id,
    aiSubtopics, // NOT SAVED
    message: "AI subtopics generated. Review before saving."
  };
};
export const addtopicService = async (topicId, subtopics) => {
  const saved = [];

  for (const sub of subtopics) {
    const exists = await subtopicModel.findOne({
      topicId,
      title: sub.title,
    });

    if (!exists) {
      const newSub = await subtopicModel.create({
        topicId,
        title: sub.title,
        content: sub.content,
      });
      saved.push(newSub);
    }
  }

  return {
    savedCount: saved.length,
    message: "Subtopics saved successfully"
  };
};


export const updateTopicsService = async (topicId, topicData) => {
  const { title, description, subtopics } = topicData;

  const topic = await topicModel.findById(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  // 1️⃣ Update Topic fields
  if (title) topic.title = title;
  if (description) topic.description = description;
  await topic.save();

  // 2️⃣ Update Subtopics smartly
  if (Array.isArray(subtopics)) {

    // IDs sent from frontend
    const incomingIds = subtopics
      .filter(sub => sub._id)
      .map(sub => sub._id.toString());
      console.log("Incoming Subtopic IDs:", incomingIds);
    // Delete removed subtopics (optional but clean)
    await subtopicModel.deleteMany({
      topicId,
      _id: { $nin: incomingIds }
    });

    for (const sub of subtopics) {

      // UPDATE existing
      if (sub._id) {
        await subtopicModel.findByIdAndUpdate(
          sub._id,
          {
            title: sub.title,
            content: sub.content
          },
          { new: true }
        );
      }
      // CREATE new
      else {
        await subtopicModel.create({
          topicId,
          title: sub.title,
          content: sub.content,
        });
      }
    }
  }

  return await topicModel.findById(topicId);
};


export const deleteTopicsService = async (topicId) => {
  const topicExist = await topicModel.findById(topicId);

  if (!topicExist) {
    throw new Error("Topic not found");
  }

  const deleteSubtopicsResult = await subtopicModel.deleteMany({ topicId: topicId });
  const deleteTopicResult = await topicModel.findByIdAndDelete(topicId);

  return {
    message: "Topic and all associated subtopics deleted",
    deletedSubtopicsCount: deleteSubtopicsResult.deletedCount,
    deletedTopic: deleteTopicResult
  };
};

export const getAllTopicsService = async () => {
  const topics = await topicModel.find();
  return topics;
};


export const findSubtopicsByTopicIdService = async (id) => {
  // 1. Optional: Check if the Topic actually exists first
  // This helps distinguish between "Topic doesn't exist" and "Topic has no subtopics"
  const topicExists = await topicModel.findById(id);
  if (!topicExists) {
    throw new Error("TOPIC_NOT_FOUND");
  }

  // 2. Find subtopics where 'topicId' matches the requested ID
  // We populate 'topicId' to get the parent topic details (title, description) in the result
  const subtopics = await subtopicModel
    .find({ topicId: id })
    .populate("topicId", "title description") // Populates parent info (optional but helpful)
    .sort({ createdAt: -1 });

  return subtopics;
};

import fs from 'fs';
import path from 'path';

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

export const seedSubtopicsDirectService = async () => {
  const filePath = path.join(process.cwd(), '../study zone (ALL TOPICs Tab).txt');
  const fallbackPath = path.join(process.cwd(), 'study zone (ALL TOPICs Tab).txt');
  
  let targetPath = filePath;
  if (!fs.existsSync(targetPath)) {
    targetPath = fallbackPath;
  }
  
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Prompt file not found at: ${targetPath}`);
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  const parts = content.split(/You are an expert NCLEX-RN /i);
  const seededSubtopics = [];

  // Clear existing subtopics
  await subtopicModel.deleteMany({});

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const specMatch = part.match(/^(?:Pharmacology\s+)?tutor\s+specializing\s+in\s+([^\.]+)\./i);
    if (!specMatch) continue;

    const specTitle = specMatch[1].trim();
    const mappedTopicTitle = topicMapping[specTitle] || specTitle;

    let topicDoc = await topicModel.findOne({ title: new RegExp(`^${mappedTopicTitle}$`, 'i') });
    if (!topicDoc) {
      topicDoc = await topicModel.create({
        title: mappedTopicTitle,
        description: `NCLEX Prep domain for ${mappedTopicTitle}`
      });
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

      const newSubtopic = await subtopicModel.create({
        topicId: topicDoc._id,
        title: subtopicTitle,
        content: finalContent
      });

      seededSubtopics.push({
        topic: topicDoc.title,
        subtopic: subtopicTitle
      });
    }
  }

  return {
    success: true,
    message: `Seeded ${seededSubtopics.length} subtopics successfully.`,
    data: seededSubtopics
  };
};