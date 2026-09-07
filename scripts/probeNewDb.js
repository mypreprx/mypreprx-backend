import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const NEW = process.env.NEW_MONGODB_URL;
if (!NEW) { console.error('set NEW_MONGODB_URL'); process.exit(1); }

const tryWrite = async (uri, label) => {
    try {
        const c = await mongoose.createConnection(uri).asPromise();
        console.log(`[${label}] connected. default db = "${c.db.databaseName}"`);
        await c.db.collection('__probe').insertOne({ x: 1 });
        console.log(`[${label}] WRITE OK to db "${c.db.databaseName}"`);
        await c.db.collection('__probe').drop();
        await c.close();
        return true;
    } catch (e) {
        console.log(`[${label}] FAIL: ${e.message}`);
        return false;
    }
};

await tryWrite(NEW, 'with-Preprx');
await tryWrite(NEW.replace(/\/Preprx\?/, '/?'), 'no-db-name');
console.log('done');
