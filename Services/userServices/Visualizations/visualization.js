import VisualRoomModel from '../../../Models/VisualRoomSchema.js';

export const getAllVisualizationService = async () => {
    const visuals = await VisualRoomModel.find({ isActive: true }).sort({ createdAt: -1 });
    return visuals;
};