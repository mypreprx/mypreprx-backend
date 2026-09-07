import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the prompt file
const PROMPT_FILE_PATH = path.join(__dirname, '../../study zone (ALL TOPICs Tab).txt');

/**
 * Parses study zone (ALL TOPICs Tab).txt to extract the specific prompt section
 * for the given main topic and subtopic.
 */
export const getDetailedPromptForSubtopic = (mainTopicName, subtopicName) => {
  try {
    if (!fs.existsSync(PROMPT_FILE_PATH)) {
      console.warn(`Prompt file not found at: ${PROMPT_FILE_PATH}. Using fallback.`);
      return null;
    }

    const content = fs.readFileSync(PROMPT_FILE_PATH, 'utf8');

    // Split by the tutor header pattern
    const topicSections = content.split(/You are an expert NCLEX-RN /i);
    
    // Find the section that matches mainTopicName
    let matchedSection = null;
    for (let i = 1; i < topicSections.length; i++) {
      const section = topicSections[i];
      const headerLine = section.split('\n')[0] || '';
      
      // Look for match (e.g. "Pharmacology" or "Safety & Infection Control")
      if (
        headerLine.toLowerCase().includes(mainTopicName.toLowerCase()) ||
        mainTopicName.toLowerCase().includes("pharmacology") && headerLine.toLowerCase().includes("pharmacology")
      ) {
        matchedSection = "You are an expert NCLEX-RN " + section;
        break;
      }
    }

    if (!matchedSection) {
      // Try a secondary looser match on the content of the section if header didn't match perfectly
      for (let i = 1; i < topicSections.length; i++) {
        const section = topicSections[i];
        if (section.toLowerCase().includes(mainTopicName.toLowerCase())) {
          matchedSection = "You are an expert NCLEX-RN " + section;
          break;
        }
      }
    }

    if (!matchedSection) {
      console.warn(`Could not find matching topic section for: ${mainTopicName}`);
      return null;
    }

    // Now find the module within this section
    const moduleParts = matchedSection.split(/MODULE (\d+)/i);
    let matchedModuleText = '';
    let moduleNumber = '';

    for (let j = 1; j < moduleParts.length; j += 2) {
      const num = moduleParts[j];
      const text = moduleParts[j + 1] || '';
      
      // Match subtopicName to the module title (usually the first few lines of the text block)
      const firstLines = text.split('\n').slice(0, 4).join('\n');
      if (
        firstLines.toLowerCase().includes(subtopicName.toLowerCase()) ||
        subtopicName.toLowerCase().includes(firstLines.trim().split('\n')[0].toLowerCase())
      ) {
        moduleNumber = num;
        matchedModuleText = text;
        break;
      }
    }

    // If no exact module match, fallback to the first module or just use the whole topic instructions
    if (!matchedModuleText && moduleParts.length > 2) {
      matchedModuleText = moduleParts[2]; // Fallback to first module text
      moduleNumber = moduleParts[1];
    }

    // Extract common rules/structure at the end of the matched topic section (usually after MODULE 4)
    // We can split the main section by "QUESTION BANK RULES" or similar separator to get the general rules
    const generalRulesIndex = matchedSection.indexOf('QUESTION BANK RULES');
    let generalRules = '';
    if (generalRulesIndex !== -1) {
      generalRules = matchedSection.substring(generalRulesIndex);
      // Clean up to keep only up to the next topic start if any
      const nextTopicStart = generalRules.indexOf('You are an expert NCLEX-RN');
      if (nextTopicStart !== -1) {
        generalRules = generalRules.substring(0, nextTopicStart);
      }
    }

    // Format the matched prompt section beautifully
    return {
      tutorPersona: matchedSection.split('==================================================')[0].trim(),
      moduleTitle: `MODULE ${moduleNumber}: ${subtopicName}`,
      moduleConcepts: matchedModuleText.split('==================================================')[0].trim(),
      generalRules: generalRules.trim()
    };
  } catch (error) {
    console.error("Error parsing prompt file:", error);
    return null;
  }
};
