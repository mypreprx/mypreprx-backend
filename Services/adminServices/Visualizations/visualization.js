import VisualRoomModel from '../../../Models/VisualRoomSchema.js';
import { formatDuration, getDuration, deleteFile } from '../../../utilities/Duration&Thumbnail.js';
import path from 'path';
export const createVisualizationService = async (visualData, mediaFile, thumbnailFile) => {
  const { title, subtitle, description, isActive } = visualData;

  if (!mediaFile) {
    throw new Error("Please upload a media file (audio or video)");
  }

  if (!mediaFile.mimetype?.startsWith('audio/') && !mediaFile.mimetype?.startsWith('video/')) {
    throw new Error("Invalid file type: only audio and video files are allowed for visualizations");
  }

  const absoluteMediaPath = mediaFile.path;
  const mediaUrl = `/${path.relative(process.cwd(), absoluteMediaPath).replace(/\\/g, '/')}`;

  let durationString = "0 min";
  let thumbnailUrl = "default_visualization.jpg";

  try {
    const durationSeconds = await getDuration(absoluteMediaPath);
    if (durationSeconds > 0) {
      durationString = formatDuration(durationSeconds);
    }
  } catch (err) {
    console.error("Duration Calculation Failed:", err);
  }

  // Optional custom thumbnail (if provided)
  if (thumbnailFile && thumbnailFile.path) {
    const absoluteThumbPath = thumbnailFile.path;
    const relativeThumbPath = path.relative(process.cwd(), absoluteThumbPath).replace(/\\/g, '/');
    thumbnailUrl = `/${relativeThumbPath}`;
  }

  const newVisual = await VisualRoomModel.create({
    title,
    subtitle,
    description,
    videoUrl: mediaUrl,
    duration: durationString,
    thumbnailUrl,
    isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true
  });

  return newVisual;
};

export const deleteVisualizationService = async (visualId) => {
  const visual = await VisualRoomModel.findById(visualId);

  if (!visual) {
    throw new Error("Visualization not found");
  }

  deleteFile(visual.videoUrl);
  deleteFile(visual.thumbnailUrl);

  await VisualRoomModel.findByIdAndDelete(visualId);

  return visual;
};

export const updateVisualizationService = async (visualId, visualData, newFile, thumbnailFile) => {
  const { title, subtitle, description, isActive } = visualData;

  const visual = await VisualRoomModel.findById(visualId);
  if (!visual) {
    throw new Error("Visualization not found");
  }

  let updateData = {
    title: title || visual.title,
    subtitle: subtitle || visual.subtitle,
    description: description || visual.description
  };

  // This way:
  // isActive sent as "true" → saves true
  // isActive sent as "false" → saves false
  // isActive not sent at all → keeps existing DB value unchanged
  // Only update isActive when explicitly sent
  if (isActive !== undefined) {
    updateData.isActive = isActive === 'true' || isActive === true;
  }

  if (newFile) {
    if (!newFile.mimetype?.startsWith('audio/') && !newFile.mimetype?.startsWith('video/')) {
      throw new Error("Invalid file type: only audio and video files are allowed for visualizations");
    }

    // Replace audio file, but keep existing thumbnail unless explicitly overwritten.
    deleteFile(visual.videoUrl);

    const absoluteMediaPath = newFile.path;
    const mediaUrl = `/${path.relative(process.cwd(), absoluteMediaPath).replace(/\\/g, '/')}`;

    let durationString = "0 min";

    try {
      const durationSeconds = await getDuration(absoluteMediaPath);
      if (durationSeconds > 0) durationString = formatDuration(durationSeconds);
    } catch (err) {
      console.error("Duration regeneration failed:", err);
    }

    updateData.videoUrl = mediaUrl;
    updateData.duration = durationString;
  }

  // Optional thumbnail override
  if (thumbnailFile && thumbnailFile.path) {
    // Only delete the existing thumbnail if it's not the shared default.
    if (visual.thumbnailUrl && !visual.thumbnailUrl.includes('default_visualization.jpg')) {
      deleteFile(visual.thumbnailUrl);
    }

    const absoluteThumbPath = thumbnailFile.path;
    const relativeThumbPath = path.relative(process.cwd(), absoluteThumbPath).replace(/\\/g, '/');
    updateData.thumbnailUrl = `/${relativeThumbPath}`;
  }

  const updatedVisual = await VisualRoomModel.findByIdAndUpdate(
    visualId,
    updateData,
    { new: true }
  );

  return updatedVisual;
};

export const getAllVisualizationService = async () => {
  const visuals = await VisualRoomModel.find({}).sort({ createdAt: -1 });
  return visuals;
};