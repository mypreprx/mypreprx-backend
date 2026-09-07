import pirPracticeSchemaModel from '../../../Models/piriorityPracticeSchema.js';
import topicModel from '../../../Models/topicSchema.js';
import subtopicModel from '../../../Models/subTopicSchema.js';
import { createPriorityPracticeService } from '../../adminServices/PiriorityPracticeService/PirPracticeService.js';

/**
 * Fetches all priority practice cases for the user.
 * @returns {Promise<Array>} List of practice cases.
 */
export const getAllPiriorityPracticeService = async (category = 'priority-practice') => {
    try {
        let practices = await pirPracticeSchemaModel.find({ category }).sort({ createdAt: -1 });

        // JIT Generation for Behavioral Health
        if (category === 'behavioral-health' && practices.length === 0) {
            console.log("No behavioral health practices found. Triggering JIT generation.");
            
            // 1. Ensure "Behavioral Health" topic exists
            let topic = await topicModel.findOne({ title: "Behavioral Health" });
            if (!topic) {
                topic = await topicModel.create({
                    title: "Behavioral Health",
                    description: "Case-based scenarios for behavioral and mental health nursing."
                });
            }

            // 2. Ensure at least one subtopic exists
            let subtopic = await subtopicModel.findOne({ topicId: topic._id, title: "Therapeutic Communication" });
            if (!subtopic) {
                subtopic = await subtopicModel.create({
                    topicId: topic._id,
                    title: "Therapeutic Communication",
                    content: "This subtopic focuses on the nurse-patient relationship and effective communication techniques in psych nursing."
                });
            }

            // 3. Generate the case study
            const newPractice = await createPriorityPracticeService(subtopic._id);
            
            // 4. Update its category to behavioral-health (it defaults to priority-practice)
            newPractice.category = 'behavioral-health';
            await newPractice.save();

            practices = [newPractice];
        }

        return practices;
    } catch (error) {
        throw new Error("Failed to fetch practices: " + error.message);
    }
};
