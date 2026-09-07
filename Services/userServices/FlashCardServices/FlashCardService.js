import Flashcard from '../../../Models/flashCards.js';
import topicModel from '../../../Models/topicSchema.js';

export const createFlashcard = async (flashcardData) => {
    if (typeof flashcardData.topic === 'string' && !flashcardData.topic.match(/^[0-9a-fA-F]{24}$/)) {
        const dbTopic = await topicModel.findOne({ title: flashcardData.topic });
        if (dbTopic) {
            flashcardData.topic = dbTopic._id;
        } else {
            const anyTopic = await topicModel.findOne();
            if (anyTopic) flashcardData.topic = anyTopic._id;
        }
    }

    const existingCard = await Flashcard.findOne({
        userId: flashcardData.userId,
        questionText: flashcardData.questionText
    });

    if (existingCard) {
        throw new Error('Flashcard already exists in your deck.');
    }

    const newFlashcard = Flashcard.create(flashcardData);
    return await newFlashcard;
};

export const getUserFlashcards = async (userId, sortOrder = 'desc') => {
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    return await Flashcard.find({ userId })
        .populate('topic')
        .sort({ createdAt: sortDirection });
};

export const deleteFlashcard = async (flashcardId, userId) => {
    return await Flashcard.findOneAndDelete({ _id: flashcardId, userId });
};