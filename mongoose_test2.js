import mongoose from 'mongoose';
const schema1 = new mongoose.Schema({
    topicId:[ {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic',
        required: true
    }]
});

const Model1 = mongoose.model('Model1', schema1);
const doc = new Model1({ topicId: ['507f1f77bcf86cd799439011'] });
console.log(doc.topicId);
