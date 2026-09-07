import userModel from '../../../Models/userSchema.js';
import scriptModel from '../../../Models/ScriptsSchema.js';

export const createNoteService = async (userId, noteData) => {
  const { title, content } = noteData;

  const newNote = await scriptModel.create({
    user: userId,
    title: title || 'Untitled Note',
    content: content
  });

  await userModel.findByIdAndUpdate(userId, {
    $push: { scriptingNotes: newNote._id }
  });

  return newNote;
};

export const updateNoteService = async (userId, noteId, noteData) => {
  const { title, content } = noteData;

  const updatedNote = await scriptModel.findOneAndUpdate(
    { _id: noteId, user: userId },
    { title, content },
    { new: true, runValidators: true }
  );

  if (!updatedNote) {
    throw new Error("Note not found or you are not authorized to edit it.");
  }

  return updatedNote;
};

export const deleteNoteService = async (userId, noteId) => {
  const deletedNote = await scriptModel.findOneAndDelete({
    _id: noteId,
    user: userId
  });

  if (!deletedNote) {
    throw new Error("Note not found or not authorized");
  }

  await userModel.findByIdAndUpdate(userId, {
    $pull: { scriptingNotes: noteId }
  });

  return deletedNote;
};

export const getAllNotesService = async (userId) => {
  const notes = await scriptModel.find({ user: userId })
    .sort({ createdAt: -1 });

  return notes;
};
