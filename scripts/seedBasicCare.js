import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import topicModel from '../Models/topicSchema.js';
import subtopicModel from '../Models/subTopicSchema.js';
import QuestionModel from '../Models/Question.js';

dotenv.config();

const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\newapp\\basiccare.txt';
const DRY_RUN = process.argv.includes('--dry-run');

// ----- label classifiers -----
const reQuestion = /^Question\s+\d+\s*\|\s*([^|]+?)\s*\|\s*(.*)$/; // -> domain (group1), focus (group2)
const rePageHeader = /^PrepRX - Basic Care(?: and| &) Comfort Page \d+$/i;
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
    ['Basic Care & Comfort Breakdown:', 'basicCareComfortBreakdown'],
    ['Clinical / Pharmacology Considerations:', 'clinicalPharmacologyText'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX Basic Care FAST+ Shortcut:', 'pedrxStrategy']
];

const classifyField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) {
            return { key, value: line.slice(label.length).trim() };
        }
    }
    return null;
};

const parseDoc = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^﻿/, '').trim());

    const questions = [];
    let current = null;       // current question being built
    let pastOptions = false;  // in teaching mode (after Answer/Teaching Package)
    let field = null;         // active teaching field key for continuation, or 'SKIP'

    const final = (q) => {
        if (!q) return;
        questions.push(q);
    };

    for (const line of lines) {
        // blank lines are ignored
        if (!line) continue;
        // page headers are ignored
        if (rePageHeader.test(line)) continue;

        // a new question starts at each "Question N | Domain | Focus" line
        const qm = line.match(reQuestion);
        if (qm) {
            final(current);
            current = {
                domain: qm[1].trim(),
                focus: qm[2].trim(),
                body: [],      // question-text lines + options (in order)
                optionMap: {},
                difficulty: '',
                correctAnswerLine: '',
                rationale: '',
                whyIncorrect: '',
                memoryTrick: '',
                nclexTrap: '',
                clinicalPearl: '',
                basicCareComfortBreakdown: '',
                clinicalPharmacologyText: '',
                nclexConnection: '',
                pedrxStrategy: ''
            };
            pastOptions = false;
            field = null;
            continue;
        }

        if (!current) continue; // ignore any preamble before first question

        // "Answer / Teaching Package - HIDDEN UNTIL SUBMISSION" -> switch to teaching mode
        if (reAnswerPkg.test(line)) {
            pastOptions = true;
            field = null;
            continue;
        }

        if (!pastOptions) {
            // BODY MODE: question text + options
            const opt = line.match(reOption);
            if (opt) {
                current.optionMap[opt[1]] = opt[2].trim();
                current.body.push({ type: 'option', letter: opt[1], text: opt[2].trim() });
            } else {
                current.body.push({ type: 'text', text: line });
            }
            continue;
        }

        // TEACHING MODE
        // ARV block -> skip its content
        if (reARV.test(line)) { field = 'SKIP'; continue; }
        if (field === 'SKIP') {
            const cf = classifyField(line);
            if (cf) {
                field = cf.key;
                assign(current, cf);
            }
            continue;
        }

        const cf = classifyField(line);
        if (cf) {
            field = cf.key;
            assign(current, cf);
        } else {
            // continuation of the active field
            if (field && field !== 'SKIP') {
                current[field] = (current[field] ? current[field] + ' ' : '') + line;
            }
        }
    }
    final(current);
    return questions;
};

const assign = (q, cf) => {
    if (cf.key === 'nclexTrap') {
        q.nclexTrap = cf.value.replace(/^NCLEX Trap:\s*/i, '');
        return;
    }
    q[cf.key] = cf.value;
};

const buildQuestionDoc = (q, subTopicId, index) => {
    const textLines = q.body.filter((b) => b.type === 'text').map((b) => b.text);
    const questionText = textLines.join(' ');

    const options = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
        if (q.optionMap[letter]) options.push(q.optionMap[letter]);
    }

    const raw = q.correctAnswerLine || '';
    const letters = (raw.match(/[A-F]\./g) || []).map((m) => m[0]);
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    const correctAnswer = correctAnswers[0] || '';

    return {
        subTopic: subTopicId,
        question: questionText,
        option: options,
        correctAnswer,
        questionType: 'Single Choice',
        difficulty: q.difficulty || 'Moderate-Hard',
        rationale: q.rationale,
        whyIncorrect: q.whyIncorrect,
        memoryTrick: q.memoryTrick,
        nclexTrap: q.nclexTrap,
        clinicalPearl: q.clinicalPearl,
        basicCareComfortBreakdown: q.basicCareComfortBreakdown,
        nclexConnection: q.nclexConnection,
        pedrxStrategy: q.pedrxStrategy,
        clinicalPharmacologyBreakdown: q.clinicalPharmacologyText
            ? { drugConcept: q.clinicalPharmacologyText }
            : undefined
    };
};

// ----- main -----
const questions = parseDoc();

const domainOrder = [];
const byDomain = {};
for (const q of questions) {
    if (!byDomain[q.domain]) { byDomain[q.domain] = []; domainOrder.push(q.domain); }
    byDomain[q.domain].push(q);
}

const totalQuestions = questions.length;
console.log(`Parsed ${totalQuestions} questions`);
console.log('By domain:');
for (const d of domainOrder) console.log(`  ${d}: ${byDomain[d].length}`);

// validate parse
const errors = [];
for (const q of questions) {
    const text = q.body.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (!text.trim()) errors.push(`Q: empty question text (domain=${q.domain})`);
    if (Object.keys(q.optionMap).length < 2) errors.push(`Q: <2 options (domain=${q.domain}) text="${text.slice(0, 60)}"`);
    const raw = q.correctAnswerLine || '';
    const letters = (raw.match(/[A-F]\./g) || []).map((m) => m[0]);
    if (letters.length === 0) errors.push(`Q: no resolvable correct answer (raw="${raw}")`);
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    if (correctAnswers.length === 0) errors.push(`Q: correct answer not in options (raw="${raw}")`);
    for (const f of ['rationale', 'whyIncorrect', 'memoryTrick', 'nclexTrap', 'clinicalPearl', 'basicCareComfortBreakdown']) {
        if (!q[f] || !String(q[f]).trim()) errors.push(`Q: empty field "${f}" (domain=${q.domain})`);
    }
    const blob = JSON.stringify({ ...q, body: undefined }).toLowerCase();
    if (blob.includes('authoritative reference validation') || blob.includes('strict validation hierarchy')) {
        errors.push(`Q: ARV leaked (domain=${q.domain})`);
    }
}
console.log(`Validation errors: ${errors.length}`);
if (errors.length) errors.slice(0, 40).forEach((e) => console.error('  - ' + e));

// sample
if (questions[0]) {
    const s = questions[0];
    const doc = buildQuestionDoc(s, 'fake-id', 0);
    console.log('\n--- SAMPLE Q1 ---');
    console.log('domain:', s.domain, '| focus:', s.focus);
    console.log('question:', doc.question.slice(0, 140));
    console.log('options:', doc.option);
    console.log('correctAnswer:', doc.correctAnswer);
    console.log('difficulty:', doc.difficulty);
    console.log('rationale:', String(doc.rationale).slice(0, 120));
    console.log('whyIncorrect:', String(doc.whyIncorrect).slice(0, 100));
    console.log('memoryTrick:', String(doc.memoryTrick).slice(0, 80));
    console.log('nclexTrap:', String(doc.nclexTrap).slice(0, 80));
    console.log('clinicalPearl:', String(doc.clinicalPearl).slice(0, 80));
    console.log('bccBreakdown:', String(doc.basicCareComfortBreakdown).slice(0, 80));
    console.log('pharm.drugConcept:', String(doc.clinicalPharmacologyBreakdown?.drugConcept).slice(0, 80));
    console.log('nclexConnection:', String(doc.nclexConnection).slice(0, 80));
    console.log('strategy:', String(doc.pedrxStrategy).slice(0, 80));
}

if (DRY_RUN || errors.length) {
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(errors.length ? 1 : 0);
}

// ----- replace & seed -----
const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);

    const topic = await topicModel.findOne({ title: /^Basic Care(?: and| &) Comfort$/i });
    if (!topic) throw new Error('Basic Care & Comfort topic not found');

    // 1) delete existing subtopics + their questions
    const existingSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const existingIds = existingSubs.map((s) => s._id);
    const delQuestions = await QuestionModel.deleteMany({ subTopic: { $in: existingIds } });
    const delSubs = await subtopicModel.deleteMany({ topicId: topic._id });
    console.log(`Deleted ${delSubs.deletedCount} old subtopics and ${delQuestions.deletedCount} old questions`);

    // 2) create new subtopics (one per domain) with content built from its focus list
    const newSubs = [];
    for (const domain of domainOrder) {
        const foci = [...new Set(byDomain[domain].map((q) => q.focus))];
        const content = `${domain} - ${foci.join('; ')}. Lesson questions: ${byDomain[domain].length}.`;
        const sub = new subtopicModel({ topicId: topic._id, title: domain, content });
        const saved = await sub.save();
        newSubs.push({ sub: saved, domain });
    }

    // 3) insert questions per subtopic
    let inserted = 0;
    for (const { sub, domain } of newSubs) {
        const docs = byDomain[domain].map((q, i) => buildQuestionDoc(q, sub._id, i));
        const res = await QuestionModel.insertMany(docs);
        inserted += res.length;
    }

    console.log(`Inserted ${inserted} new questions across ${newSubs.length} subtopics`);

    // 4) verify
    for (const { sub, domain } of newSubs) {
        const c = await QuestionModel.countDocuments({ subTopic: sub._id });
        console.log(`  [${sub.title}] questions: ${c} | id=${sub._id}`);
    }
    const leftover = await QuestionModel.countDocuments({
        subTopic: { $in: newSubs.map((x) => x.sub._id) },
        $or: [
            { rationale: /Authoritative Reference Validation/i },
            { clinicalPearl: /Authoritative Reference Validation/i },
            { nclexTrap: /Authoritative Reference Validation/i }
        ]
    });
    console.log('Docs with ARV leaked into teaching fields:', leftover);

    console.log('\nDone.');
    process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
