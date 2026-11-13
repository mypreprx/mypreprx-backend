import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import topicModel from '../Models/topicSchema.js';
import subtopicModel from '../Models/subTopicSchema.js';
import QuestionModel from '../Models/Question.js';

dotenv.config();

const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\newapp\\nclex.txt';
const TOPIC_TITLE = 'NCLEX Language Decoder';
const DRY_RUN = process.argv.includes('--dry-run');

// ----- label classifiers -----
const reQuestion = /^Decoder Focus:\s*(.*)$/; // -> focus (group1)
const rePageHeader = /^PrepRX - .*Page \d+$/i;
const reAnswerPkg = /^Answer \/ Teaching Package - HIDDEN UNTIL SUBMISSION/i;
const reOption = /^([A-F])\.\s+(.*)$/;
const reNoise = /^(No visible source question numbers|END OF PROMPT)\b/i;

const FIELD_LABELS = [
    ['Difficulty:', 'difficulty'],
    ['Correct Answer:', 'correctAnswerLine'],
    ['Correct Selections:', 'correctAnswerLine'],
    ['Detailed Rationale:', 'rationale'],
    ['Rationale:', 'rationale'],
    ['Why Each Incorrect Answer Is Wrong:', 'whyIncorrect'],
    ['Option-by-Option Rationale:', 'whyIncorrect'],
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Clinical Pharmacology Breakdown:', 'clinicalPharmacologyBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX Language Decoder Strategy:', 'pedrxStrategy'],
    ['PrepRX Test-Taking Strategy:', 'pedrxStrategy'],
    ['Authoritative Reference Validation:', 'authoritativeReferenceValidation'],
    ['Number Correct:', 'numberCorrect']
];

const classifyField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) {
            return { key, value: line.slice(label.length).trim() };
        }
    }
    return null;
};

// The bank layout is label-driven:
//   Decoder Focus: X
//   <stem lines>
//   A..D
//   Difficulty: ...
//   Correct Answer: ...
//   ... teaching fields ...
//   Authoritative Reference Validation: ...
//   (page header / "No visible..." / "Answer / Teaching Package" / next question)
// The "Answer / Teaching Package" marker trails the teaching block and precedes
// the next question, so it must NOT be used to switch parsing modes.
const parseDoc = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\ufeff/, '').trim());

    const questions = [];
    let current = null;       // current question being built
    let mode = 'body';        // 'body' = stem/options, 'teaching' = field package
    let field = null;         // active teaching field key for continuation, or 'SKIP'

    const final = (q) => {
        if (!q) return;
        questions.push(q);
    };

    for (const line of lines) {
        // blank lines are ignored
        if (!line) continue;
        // page headers and boilerplate markers are ignored
        if (rePageHeader.test(line)) continue;
        if (reAnswerPkg.test(line)) continue;
        if (reNoise.test(line)) continue;

        // a new question starts at each "Decoder Focus:" line
        const qm = line.match(reQuestion);
        if (qm) {
            final(current);
            current = {
                focus: qm[1].trim(),
                body: [],
                optionMap: {},
                difficulty: '',
                correctAnswerLine: '',
                rationale: '',
                whyIncorrect: '',
                memoryTrick: '',
                nclexTrap: '',
                clinicalPearl: '',
                clinicalPharmacologyBreakdown: '',
                nclexConnection: '',
                pedrxStrategy: ''
            };
            mode = 'body';
            field = null;
            continue;
        }

        if (!current) continue; // ignore any preamble before first question

        // options belong to the stem section only
        const opt = line.match(reOption);
        if (opt && mode === 'body') {
            current.optionMap[opt[1]] = opt[2].trim();
            current.body.push({ type: 'option', letter: opt[1], text: opt[2].trim() });
            continue;
        }

        // any teaching field label switches to teaching mode
        const cf = classifyField(line);
        if (cf) {
            mode = 'teaching';
            if (cf.key === 'authoritativeReferenceValidation' || cf.key === 'numberCorrect') {
                // ARV is not part of the stored question schema; skip its content.
                field = 'SKIP';
                continue;
            }
            field = cf.key;
            assign(current, cf);
            continue;
        }

        if (mode === 'body') {
            // BODY MODE: question stem text
            current.body.push({ type: 'text', text: line });
        } else if (field && field !== 'SKIP') {
            // continuation of the active teaching field
            current[field] = (current[field] ? current[field] + ' ' : '') + line;
        }
    }
    final(current);
    return questions;
};

const assign = (q, cf) => {
    if (cf.key === 'nclexTrap') {
        // strip duplicated label prefix seen in the source ("NCLEX Trap: NCLEX Trap: ...")
        q.nclexTrap = cf.value.replace(/^NCLEX Trap:\s*/i, '');
        return;
    }
    q[cf.key] = cf.value;
};

// "Correct Answer: C" (bare letter, no trailing dot). Only the LEADING key
// letter(s) count so option text can never contribute extra answers.
const resolveLetters = (raw) => {
    if (!raw) return [];
    const m = String(raw).trim().match(/^([A-F](?:\s*[,/&]\s*[A-F])*)/);
    return m ? [...new Set(m[1].match(/[A-F]/g) || [])] : [];
};

const buildQuestionDoc = (q, subTopicId) => {
    const textLines = q.body.filter((b) => b.type === 'text').map((b) => b.text);
    const questionText = textLines.join(' ');

    const options = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
        if (q.optionMap[letter]) options.push(q.optionMap[letter]);
    }

    const letters = resolveLetters(q.correctAnswerLine || '');
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    const correctAnswer = correctAnswers[0] || '';

    return {
        subTopic: subTopicId,
        question: questionText,
        option: options,
        correctAnswer,
        questionType: 'Single Choice',
        difficulty: q.difficulty || 'Moderate-Hard',
        decoderFocus: q.focus,
        rationale: q.rationale,
        whyIncorrect: q.whyIncorrect,
        memoryTrick: q.memoryTrick,
        nclexTrap: q.nclexTrap,
        clinicalPearl: q.clinicalPearl,
        nclexConnection: q.nclexConnection,
        pedrxStrategy: q.pedrxStrategy,
        clinicalPharmacologyBreakdown: q.clinicalPharmacologyBreakdown
            ? { drugConcept: q.clinicalPharmacologyBreakdown }
            : undefined
    };
};

// ----- main -----
const questions = parseDoc();

const totalQuestions = questions.length;
console.log(`Parsed ${totalQuestions} questions`);

// group by decoder focus for subtopic organization
const focusOrder = [];
const byFocus = {};
for (const q of questions) {
    if (!byFocus[q.focus]) { byFocus[q.focus] = []; focusOrder.push(q.focus); }
    byFocus[q.focus].push(q);
}
console.log('By decoder focus:');
for (const f of focusOrder) console.log(`  ${f}: ${byFocus[f].length}`);

// validate parse
const errors = [];
for (const q of questions) {
    const text = q.body.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (!text.trim()) errors.push('Q: empty question text');
    if (/(Difficulty:|Correct Answer:|Detailed Rationale:)/.test(text)) {
        errors.push(`Q: teaching field leaked into stem -> "${text.slice(0, 70)}"`);
    }
    if (Object.keys(q.optionMap).length !== 4) errors.push(`Q: option count = ${Object.keys(q.optionMap).length} text="${text.slice(0, 60)}"`);
    const letters = resolveLetters(q.correctAnswerLine || '');
    if (letters.length === 0) errors.push(`Q: no resolvable correct answer (raw="${q.correctAnswerLine}")`);
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    if (correctAnswers.length === 0) errors.push(`Q: correct answer not in options (raw="${q.correctAnswerLine}")`);
    for (const f of ['rationale', 'whyIncorrect', 'memoryTrick', 'nclexTrap', 'clinicalPearl']) {
        if (!q[f] || !String(q[f]).trim()) errors.push(`Q: empty field "${f}"`);
    }
    const blob = JSON.stringify({ ...q, body: undefined }).toLowerCase();
    if (blob.includes('authoritative reference validation') || blob.includes('strict validation hierarchy')) {
        errors.push('Q: ARV leaked');
    }
}
console.log(`Validation errors: ${errors.length}`);
if (errors.length) errors.slice(0, 40).forEach((e) => console.error('  - ' + e));

// sample
if (questions[0]) {
    const s = questions[0];
    const doc = buildQuestionDoc(s, 'fake-id');
    console.log('\n--- SAMPLE Q1 ---');
    console.log('focus:', s.focus);
    console.log('question:', doc.question.slice(0, 140));
    console.log('options:', doc.option);
    console.log('correctAnswer:', doc.correctAnswer);
    console.log('difficulty:', doc.difficulty);
    console.log('rationale:', String(doc.rationale).slice(0, 120));
    console.log('whyIncorrect:', String(doc.whyIncorrect).slice(0, 100));
    console.log('memoryTrick:', String(doc.memoryTrick).slice(0, 80));
    console.log('nclexTrap:', String(doc.nclexTrap).slice(0, 80));
    console.log('clinicalPearl:', String(doc.clinicalPearl).slice(0, 80));
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

    // find or create the topic
    let topic = await topicModel.findOne({ title: { $regex: new RegExp('^' + TOPIC_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
    if (!topic) {
        topic = new topicModel({ title: TOPIC_TITLE, description: 'NCLEX Language Decoder command-word drill bank.' });
        topic = await topic.save();
        console.log(`Created topic "${topic.title}" (${topic._id})`);
    } else {
        console.log(`Using existing topic "${topic.title}" (${topic._id})`);
    }

    // 1) delete existing subtopics + their questions
    const existingSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const existingIds = existingSubs.map((s) => s._id);
    const delQuestions = await QuestionModel.deleteMany({ subTopic: { $in: existingIds } });
    const delSubs = await subtopicModel.deleteMany({ topicId: topic._id });
    console.log(`Deleted ${delSubs.deletedCount} old subtopics and ${delQuestions.deletedCount} old questions`);

    // 2) create new subtopics (one per decoder focus) with content built from its focus list
    const newSubs = [];
    for (const focus of focusOrder) {
        const content = `${focus} - command-word drill. Lesson questions: ${byFocus[focus].length}.`;
        const sub = new subtopicModel({ topicId: topic._id, title: focus, content });
        const saved = await sub.save();
        newSubs.push({ sub: saved, focus });
    }

    // 3) insert questions per subtopic
    let inserted = 0;
    for (const { sub, focus } of newSubs) {
        const docs = byFocus[focus].map((q) => buildQuestionDoc(q, sub._id));
        const res = await QuestionModel.insertMany(docs);
        inserted += res.length;
    }

    console.log(`Inserted ${inserted} new questions across ${newSubs.length} subtopics`);

    // 4) verify
    for (const { sub, focus } of newSubs) {
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