import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    console.log('Database:', db.databaseName);
    console.log('Total collections:', cols.length);
    console.log('---');
    for (const c of cols) {
        const name = c.name;
        const count = await db.collection(name).countDocuments({});
        console.log(`${name.padEnd(40)} docs=${count}`);
    }
    await mongoose.disconnect();
};
main().catch(e => { console.error(e); process.exit(1); });
