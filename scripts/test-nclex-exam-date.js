/**
 * HTTP-layer tests for PUT /user/nclex-exam-date.
 *
 * Boots the real Express app against the real database and verifies that an
 * authenticated premium user can set / update / clear their NCLEX exam date,
 * that the value is persisted, and that the endpoint is protected.
 *
 * Run:  node scripts/test-nclex-exam-date.js
 */
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

import userRoutes from '../Routes/userRoutes.js';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';

const PORT = 4128;
const BASE = `http://127.0.0.1:${PORT}`;

const createdUsers = [];

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

const section = (name) => console.log(`\n${name}`);

const newUser = async (label, subOverrides = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await userModel.create({
    username: `nclex_${label}_${stamp}`,
    email: `nclex_${label}_${stamp}@example.invalid`,
    password: 'x'.repeat(60),
    role: 'user',
    subscription: { ...subOverrides },
  });
  createdUsers.push(user._id);
  return user;
};

const loginAs = async (email, password) => {
  const res = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, token: body?.token, body };
};

const setDate = async (token, payload) => {
  const res = await fetch(`${BASE}/api/user/nclex-exam-date`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

const daysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', userRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));

  const plainPassword = 'NclexTest123!';

  try {
    section('Auth guard');
    const noAuth = await setDate(null, { nclexExamDate: daysFromNow(30) });
    check('no credentials -> 401', noAuth.status === 401, String(noAuth.status));

    const bogus = await setDate('not-a-real-jwt', { nclexExamDate: daysFromNow(30) });
    check('invalid token -> 401', bogus.status === 401, String(bogus.status));

    section('Set a valid exam date (premium user)');
    const user = await newUser('valid', { status: 'promo', premium: true });
    user.password = await bcrypt.hash(plainPassword, 10);
    await user.save();

    const login = await loginAs(user.email, plainPassword);
    check('login succeeds', Boolean(login.token), login.body?.message);

    const target = daysFromNow(28);
    const res = await setDate(login.token, { nclexExamDate: target });
    check('set date -> 200', res.status === 200, String(res.status));
    check('success flag', res.body?.success === true);
    check('response includes user', Boolean(res.body?.user));

    const stored = await userModel.findById(user._id);
    check('date persisted', Boolean(stored.nclexExamDate));
    check(
      'date matches what was sent',
      new Date(stored.nclexExamDate).toISOString().slice(0, 10) === target.slice(0, 10),
      stored.nclexExamDate?.toString()
    );
    check('setAt timestamp recorded', Boolean(stored.nclexExamDateSetAt));

    section('Update an existing exam date');
    const newTarget = daysFromNow(45);
    const update = await setDate(login.token, { nclexExamDate: newTarget });
    check('update -> 200', update.status === 200, String(update.status));
    const stored2 = await userModel.findById(user._id);
    check(
      'date replaced',
      new Date(stored2.nclexExamDate).toISOString().slice(0, 10) === newTarget.slice(0, 10),
      stored2.nclexExamDate?.toString()
    );

    section('Clear the exam date (skip)');
    const cleared = await setDate(login.token, { nclexExamDate: null });
    check('clear -> 200', cleared.status === 200, String(cleared.status));
    const stored3 = await userModel.findById(user._id);
    check('date is null', stored3.nclexExamDate === null, stored3.nclexExamDate?.toString());

    section('Invalid input rejected');
    const bad = await setDate(login.token, { nclexExamDate: 'not-a-date' });
    check('garbage date -> 400', bad.status === 400, String(bad.status));
    const stillEmpty = await userModel.findById(user._id);
    check('nothing written on invalid input', stillEmpty.nclexExamDate === null);

    section('Profile endpoint exposes the new field');
    const homeRes = await fetch(`${BASE}/api/user/Home`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const homeBody = await homeRes.json().catch(() => ({}));
    check('GET /user/Home does not leak the password', homeBody?.user?.password === undefined);
    check(
      'GET /user/Home does not leak the session token',
      homeBody?.user?.sessionToken === undefined
    );
    check(
      'nclexExamDate key is available to the client',
      Object.prototype.hasOwnProperty.call(homeBody?.user || {}, 'nclexExamDate')
    );

    section('Method safety');
    const getAttempt = await fetch(`${BASE}/api/user/nclex-exam-date`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    check(
      'GET on the route is not accepted',
      getAttempt.status === 404 || getAttempt.status === 405,
      String(getAttempt.status)
    );
  } finally {
    server.close();
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
};

const cleanup = async () => {
  try {
    const ids = createdUsers.map((id) => new mongoose.Types.ObjectId(String(id)));
    if (ids.length) {
      await notificationModel.deleteMany({ user: { $in: ids } });
      await userModel.deleteMany({ _id: { $in: ids } });
    }
    console.log(`\nCleanup: ${createdUsers.length} users removed.`);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
};

run()
  .then(cleanup)
  .then(async () => {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('\nHTTP test crashed:', err);
    await cleanup();
    await mongoose.disconnect();
    process.exit(1);
  });
