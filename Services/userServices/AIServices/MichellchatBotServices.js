import ChatSessionModel from '../../../Models/chatHistoryScehma.js' 
import {getMichelleResponse} from '../../../utilities/MichelChatbot.js'
export const processUserMessageService = async (userId, sessionId, messageContent) => {
  let session;

  // 1. Find or Create Session
  if (sessionId) {
    session = await ChatSessionModel.findById(sessionId);
    if (!session) throw new Error("Session not found");
  } else {
    // Start a new session with a title based on the first message (truncated)
    session = await ChatSessionModel.create({
      userId,
      title: messageContent.substring(0, 30) + "...",
      messages: []
    });
  }

  // 2. Add User Message to DB
  session.messages.push({ role: 'user', content: messageContent }); 

  // 3. Prepare Context for AI (Limit to last 10 messages to save tokens)
  // We map strictly to { role, content } to avoid sending Mongoose IDs to OpenAI
  const historyForAI = session.messages.slice(-10).map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // 4. Get AI Response
  const aiReply = await getMichelleResponse(historyForAI);

  // 5. Add AI Message to DB
  session.messages.push({ role: 'system', content: aiReply });

  // 6. Save changes
  await session.save();

  return {
    sessionId: session._id,
    title: session.title,
    reply: aiReply,
    history: session.messages
  };
};

export const getUserChatHistory = async (userId) => {
  return await ChatSessionModel.find({ userId })
    .select('title createdAt updatedAt') // Only need titles for the sidebar
    .sort({ updatedAt: -1 }); // Newest first
};

/**
 * Fetches a single full chat session.
 */
export const getSessionDetails = async (sessionId) => {
  return await ChatSessionModel.findById(sessionId);
};