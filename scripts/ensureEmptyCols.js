import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const NEW = process.env.NEW_MONGODB_URL;
const OLD = process.env.MONGODB_URL; // still the old URI in .env

const emptyCols = ['nursingtipschemas', 'motivationposts', 'questionflags'];

const oldConn = await mongoose.createConnection(OLD).asPromise();
const newConn = await mongoose.createConnection(NEW).asPromise();
const oldDb = oldConn.db;
const newDb = newConn.db;

const existing = (await newDb.listCollections().toArray()).map(c => c.name);

for (const name of emptyCols) {
    if (!existing.includes(name)) {
        await newDb.createCollection(name);
        console.log(`created empty collection: ${name}`);
    } else {
        console.log(`already exists: ${name}`);
    }
    // copy any non-_id indexes
    const indexes = await oldDb.collection(name).indexes();
    for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        try {
            const opts = { ...idx.options, name: idx.name };
            delete opts.ns; delete opts.v; delete opts.background;
            await newDb.collection(name).createIndex(idx.key, opts);
            console.log(`  index ${idx.name} recreated on ${name}`);
        } catch (e) {
            console.log(`  index ${idx.name} on ${name} skip: ${e.message}`);
        }
    }
}

await oldConn.close();
await newConn.close();
console.log('empty collections ensured.');
