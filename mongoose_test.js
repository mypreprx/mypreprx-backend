import mongoose from 'mongoose';
const schema1 = new mongoose.Schema({
    topicId:[ {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic',
        required: true
    }]
});

const schema2 = new mongoose.Schema({
    topicId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'topic'
    }]
});

console.log("schema1 path topicId:", schema1.path('topicId').constructor.name);
console.log("schema1 path topicId caster:", schema1.path('topicId').caster.constructor.name);

console.log("schema2 path topicId:", schema2.path('topicId').constructor.name);
console.log("schema2 path topicId caster:", schema2.path('topicId').caster.constructor.name);
