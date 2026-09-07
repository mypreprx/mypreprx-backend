// import topicModel from '../../../Models/topicSchema.js';
// import StudyBuddyModel from '../../../Models/studyBuddySchema.js';

// export const createStudyRequestService = async (userId, requestData) => {
//   const { topicId, goal, availability } = requestData;

//   if (!topicId || !goal || !availability) {
//     throw new Error("All fields are required.");
//   }

//   const existingTopic = await topicModel.findById(topicId);

//   if (!existingTopic) {
//     throw new Error("Topic not found");
//   }

//   const newRequest = await StudyBuddyModel.create({
//     creator: userId,
//     topic: topicId,
//     goal: goal,
//     availableTime: availability
//   });

//   const populatedRequest = await newRequest.populate([
//     { path: 'creator', select: 'username email' },
//     { path: 'topic', select: 'title' }
//   ]);

//   return populatedRequest;
// };

// export const getAllStudyRequestsService = async (filterTopicId) => {
//   let query = { status: 'Open' };

//   if (filterTopicId) {
//     if (Array.isArray(filterTopicId)) {
//       query.topic = { $in: filterTopicId };
//     } else if (filterTopicId !== 'All') {
//       query.topic = filterTopicId;
//     }
//   }

//   const requests = await StudyBuddyModel.find(query)
//     .sort({ createdAt: -1 })
//     .populate('creator', 'username email')
//     .populate('topic', 'title')
//     .populate('replies.user', 'username');

//   return requests;
// };

// export const replyToStudyRequestService = async (requestId, userId, message) => {
//   if (!message) {
//     throw new Error("Message cannot be empty");
//   }

//   const request = await StudyBuddyModel.findById(requestId);
//   if (!request) {
//     throw new Error("Study Request not found");
//   }

//   const newReply = {
//     user: userId,
//     message: message,
//     createdAt: new Date()
//   };

//   request.replies.push(newReply);
//   await request.save();

//   const updatedRequest = await StudyBuddyModel.findById(requestId)
//     .populate('replies.user', 'username email');

//   const addedReply = updatedRequest.replies[updatedRequest.replies.length - 1];

//   return { requestId, updatedRequest, addedReply };
// };





import topicModel from '../../../Models/topicSchema.js';
import StudyBuddyModel from '../../../Models/studyBuddySchema.js';

export const createStudyRequestService = async (userId, requestData) => {
  const { topicId, goal, availability } = requestData;

  if (!topicId || !goal || !availability) {
    throw new Error("All fields are required.");
  }

  const existingTopic = await topicModel.findById(topicId);

  if (!existingTopic) {
    throw new Error("Topic not found");
  }

  const newRequest = await StudyBuddyModel.create({
    creator: userId,
    topic: topicId,
    goal: goal,
    availableTime: availability
  });

  const populatedRequest = await newRequest.populate([
    { path: 'creator', select: 'username email' },
    { path: 'topic', select: 'title' }
  ]);

  return populatedRequest;
};

export const getAllStudyRequestsService = async (filterTopicId) => {
  let query = { status: 'Open' };

  if (filterTopicId) {
    if (Array.isArray(filterTopicId)) {
      query.topic = { $in: filterTopicId };
    } else if (filterTopicId !== 'All') {
      query.topic = filterTopicId;
    }
  }

  const requests = await StudyBuddyModel.find(query)
    .sort({ createdAt: -1 })
    .populate('creator', 'username email')
    .populate('topic', 'title')
    .populate('replies.user', 'username');

  return requests;
};

export const replyToStudyRequestService = async (requestId, userId, message) => {
    // ... your existing save logic ...
    const request = await StudyBuddyModel.findById(requestId);
    const newReply = { user: userId, message, createdAt: new Date() };
    request.replies.push(newReply);
    await request.save();

    // Populate everything before sending back to frontend
    const updatedRequest = await StudyBuddyModel.findById(requestId)
        .populate('creator', 'username email')
        .populate('topic', 'title')
        .populate('replies.user', 'username email');

    const addedReply = updatedRequest.replies[updatedRequest.replies.length - 1];

    return { addedReply, updatedRequest };
};
export const getChatHistoryService = async (requestId, currentUserId, partnerId) => {
    // 1. Fetch request with populated user details
    const request = await StudyBuddyModel.findById(requestId)
        .populate('creator', 'username email')
        .populate('replies.user', 'username email');

    if (!request) {
        throw new Error("Study request not found");
    }

    const creatorId = String(request.creator._id);
    const myIdStr = String(currentUserId);
    
    // 2. Logic to identify who the 'partner' is if not explicitly provided
    // If I'm the responder, my partner is automatically the Creator
    const effectivePartnerId = partnerId ? String(partnerId) : creatorId;

    // 3. Filter the replies array
    const conversation = request.replies.filter(reply => {
        const senderId = String(reply.user._id);
        
        // A message belongs to this thread if:
        // - Sent by Me OR Sent by the Partner I'm chatting with
        return senderId === myIdStr || senderId === effectivePartnerId;
    });

    return {
        topic: request.topic,
        goal: request.goal,
        partnerName: request.creator.username,
        messages: conversation
    };
};