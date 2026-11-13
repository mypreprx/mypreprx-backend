import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import topicModel from '../Models/topicSchema.js';
import subtopicModel from '../Models/subTopicSchema.js';
import QuestionModel from '../Models/Question.js';

dotenv.config();

const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\newapp\\Health.txt';
const DRY_RUN = process.argv.includes('--dry-run');

const reQuestion = /^Question\s+\d+\s*\|\s*([^|]+?)\s*\|\s*(.*)$/;
const rePageHeader = /^PrepRX - Health Promotion & Maintenance Page \d+$/i;
const reAnswerPkg = /^Answer \/ Teaching Package - HIDDEN UNTIL SUBMISSION/i;
const reOption = /^([A-F])\.\s+(.*)$/;
const reARV = /^Authoritative Reference Validation/i;

const FIELD_LABELS = [
    ['Difficulty:', 'difficulty'],
    ['Correct Answer:', 'correctAnswerLine'],
    ['Detailed Rationale:', 'rationale'],
    ['Why Each Incorrect Answer Is Wrong:', 'whyIncorrect'],
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Health Promotion Breakdown:', 'healthPromotionBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX GROW FAST+ Strategy:', 'pedrxStrategy']
];

const classifyField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) return { key, value: line.slice(label.length).trim() };
    }
    return null;
};

const parseDoc = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^﻿/, '').trim());
    const questions = [];
    let current = null;
    let pastOptions = false;
    let field = null;
    const final = (q) => { if (!q) return; questions.push(q); };

    for (const line of lines) {
        if (!line) continue;
        if (rePageHeader.test(line)) continue;
        const qm = line.match(reQuestion);
        if (qm) {
            final(current);
            current = { domain: qm[1].trim(), focus: qm[2].trim(), body: [], optionMap: {}, difficulty: '', correctAnswerLine: '', rationale: '', whyIncorrect: '', memoryTrick: '', nclexTrap: '', clinicalPearl: '', healthPromotionBreakdown: '', nclexConnection: '', pedrxStrategy: '' };
            pastOptions = false;
            field = null;
            continue;
        }
        if (!current) continue;
        if (reAnswerPkg.test(line)) { pastOptions = true; field = null; continue; }
        if (!pastOptions) {
            // Some source files place the teaching package BEFORE the
            // "Answer / Teaching Package" marker. Detect a teaching field
            // here so those files parse correctly too.
            const earlyField = classifyField(line);
            if (earlyField) {
                pastOptions = true;
                field = earlyField.key;
                assign(current, earlyField);
                continue;
            }
            const opt = line.match(reOption);
            if (opt) { current.optionMap[opt[1]] = opt[2].trim(); current.body.push({ type: 'option', letter: opt[1], text: opt[2].trim() }); }
            else { current.body.push({ type: 'text', text: line }); }
            continue;
        }
        if (reARV.test(line)) { field = 'SKIP'; continue; }
        if (field === 'SKIP') { const cf = classifyField(line); if (cf) { field = cf.key; assign(current, cf); } continue; }
        const cf = classifyField(line);
        if (cf) { field = cf.key; assign(current, cf); }
        else { if (field && field !== 'SKIP') current[field] = (current[field] ? current[field] + ' ' : '') + line; }
    }
    final(current);
    return questions;
};

const assign = (q, cf) => {
    if (cf.key === 'nclexTrap') { q.nclexTrap = cf.value.replace(/^NCLEX Trap:\s*/i, ''); return; }
    if (cf.key === 'difficulty') { q.difficulty = cf.value.replace(/\s+Clinical Judgment:.*$/i, '').trim(); return; }
    q[cf.key] = cf.value;
};

const buildQuestionDoc = (q, subTopicId) => {
    const questionText = q.body.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    const options = [];
    for (const letter of ['A','B','C','D','E','F']) { if (q.optionMap[letter]) options.push(q.optionMap[letter]); }
    const raw = q.correctAnswerLine || '';
    const letters = (raw.match(/[A-F]\./g) || []).map((m) => m[0]);
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    const correctAnswer = correctAnswers[0] || '';
    return { subTopic: subTopicId, question: questionText, option: options, correctAnswer, questionType: 'Single Choice', difficulty: q.difficulty || 'Moderate-Hard', rationale: q.rationale, whyIncorrect: q.whyIncorrect, memoryTrick: q.memoryTrick, nclexTrap: q.nclexTrap, clinicalPearl: q.clinicalPearl, healthPromotionBreakdown: q.healthPromotionBreakdown, nclexConnection: q.nclexConnection, pedrxStrategy: q.pedrxStrategy };
};

const questions = parseDoc();
const domainOrder = [];
const byDomain = {};
for (const q of questions) { if (!byDomain[q.domain]) { byDomain[q.domain] = []; domainOrder.push(q.domain); } byDomain[q.domain].push(q); }

console.log(`Parsed ${questions.length} questions`);
for (const d of domainOrder) console.log(`  ${d}: ${byDomain[d].length}`);

const errors = [];
for (const q of questions) {
    const text = q.body.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (!text.trim()) errors.push(`Q: empty question text (domain=${q.domain})`);
    if (Object.keys(q.optionMap).length < 2) errors.push(`Q: <2 options (domain=${q.domain})`);
    const raw = q.correctAnswerLine || '';
    const letters = (raw.match(/[A-F]\./g) || []).map((m) => m[0]);
    if (letters.length === 0) errors.push(`Q: no resolvable correct answer`);
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    if (correctAnswers.length === 0) errors.push(`Q: correct answer not in options`);
    for (const f of ['rationale','whyIncorrect','memoryTrick','nclexTrap','clinicalPearl','healthPromotionBreakdown']) { if (!q[f] || !String(q[f]).trim()) errors.push(`Q: empty field "${f}" (domain=${q.domain})`); }
    const blob = JSON.stringify({ ...q, body: undefined }).toLowerCase();
    if (blob.includes('authoritative reference validation')) errors.push(`Q: ARV leaked (domain=${q.domain})`);
}
console.log(`Validation errors: ${errors.length}`);
if (errors.length) errors.slice(0, 40).forEach((e) => console.error('  - ' + e));

if (questions[0]) {
    const doc = buildQuestionDoc(questions[0], 'fake-id');
    console.log('\n--- SAMPLE Q1 ---');
    console.log('domain:', questions[0].domain, '| focus:', questions[0].focus);
    console.log('question:', doc.question.slice(0, 140));
    console.log('correctAnswer:', doc.correctAnswer);
    console.log('difficulty:', doc.difficulty);
    console.log('hpBreakdown:', String(doc.healthPromotionBreakdown).slice(0, 80));
    console.log('strategy:', String(doc.pedrxStrategy).slice(0, 80));
}

if (DRY_RUN || errors.length) { console.log('\nDRY-RUN: no database changes made.'); process.exit(errors.length ? 1 : 0); }

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    const topic = await topicModel.findOne({ title: /^Health Promotion & Maintenance$/i });
    if (!topic) throw new Error('Health Promotion & Maintenance topic not found');
    const existingSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const existingIds = existingSubs.map((s) => s._id);
    const delQ = await QuestionModel.deleteMany({ subTopic: { $in: existingIds } });
    const delS = await subtopicModel.deleteMany({ topicId: topic._id });
    console.log(`Deleted ${delS.deletedCount} old subtopics and ${delQ.deletedCount} old questions`);
    const newSubs = [];
    for (const domain of domainOrder) {
        const foci = [...new Set(byDomain[domain].map((q) => q.focus))];
        const sub = new subtopicModel({ topicId: topic._id, title: domain, content: `${domain} - ${foci.join('; ')}. Lesson questions: ${byDomain[domain].length}.` });
        newSubs.push({ sub: await sub.save(), domain });
    }
    let inserted = 0;
    for (const { sub, domain } of newSubs) {
        const docs = byDomain[domain].map((q, i) => buildQuestionDoc(q, sub._id, i));
        inserted += (await QuestionModel.insertMany(docs)).length;
    }
    console.log(`Inserted ${inserted} new questions across ${newSubs.length} subtopics`);
    for (const { sub } of newSubs) console.log(`  [${sub.title}] q=${await QuestionModel.countDocuments({ subTopic: sub._id })}`);
    const leftover = await QuestionModel.countDocuments({ subTopic: { $in: newSubs.map((x) => x.sub._id) }, $or: [{ rationale: /Authoritative Reference Validation/i }, { clinicalPearl: /Authoritative Reference Validation/i }, { nclexTrap: /Authoritative Reference Validation/i }] });
    console.log('ARV leaked:', leftover);
    console.log('\nDone.'); process.exit(0);
};
run().catch((e) => { console.error(e); process.exit(1); });
