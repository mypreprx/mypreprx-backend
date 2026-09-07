import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const OLD_URI = process.env.OLD_MONGODB_URL || process.env.MONGODB_URL;
const NEW_URI = process.env.NEW_MONGODB_URL;

if (!OLD_URI) { console.error('Missing OLD_MONGODB_URL (or MONGODB_URL in .env)'); process.exit(1); }
if (!NEW_URI) { console.error('Missing NEW_MONGODB_URL. Set it, e.g.:\n  NEW_MONGODB_URL="mongodb+srv://user:pass@cluster/NewDb" node scripts/migrateDb.js'); process.exit(1); }

const oldConn = await mongoose.createConnection(OLD_URI).asPromise();
const newConn = await mongoose.createConnection(NEW_URI).asPromise();
const oldDb = oldConn.db;
const newDb = newConn.db;

const cols = await oldDb.listCollections().toArray();
console.log(`Migrating ${cols.length} collections OLD -> NEW\n`);

for (const c of cols) {
    const name = c.name;
    try {
        const docs = await oldDb.collection(name).find({}).toArray();
        // Clear target collection for an exact copy
        await newDb.collection(name).deleteMany({});
        if (docs.length) {
            await newDb.collection(name).insertMany(docs, { ordered: false });
        }
        // Recreate indexes (skip default _id index)
        const indexes = await oldDb.collection(name).indexes();
        for (const idx of indexes) {
            if (idx.name === '_id_') continue;
            try {
                const opts = { ...idx.options, name: idx.name };
                delete opts.ns; delete opts.v; delete opts.background;
                await newDb.collection(name).createIndex(idx.key, opts);
            } catch (e) {
                console.log(`  ! index "${idx.name}" on ${name} not recreated: ${e.message}`);
            }
        }
        const newCount = await newDb.collection(name).countDocuments({});
        console.log(`  ${name.padEnd(36)} copied ${docs.length} docs (target now ${newCount})`);
    } catch (e) {
        console.error(`  FAILED ${name}: ${e.message}`);
    }
}

await oldConn.close();
await newConn.close();
console.log('\nMigration complete.');
