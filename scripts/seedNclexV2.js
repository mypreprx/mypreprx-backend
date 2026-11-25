/**
 * Seeds the Strategy Zone "NCLEX Language Decoder" drill bank from the v2.0
 * export (NCLEX.txt: 100 items, PRX-LNG-001 .. PRX-LNG-100).
 *
 * Important: the Strategy Zone page's "Start Practice Drill" button opens the
 * topic drill at /study-zone/topic-drill, which reads the `questions`
 * collection through the topic "NCLEX Language Decoder" (not strategyquestions).
 * This script therefore replaces that topic's subtopics + questions, mirroring
 * scripts/seedNclexLanguageDecoder.js.
 *
 * Layout (same teaching package as the other v2 banks):
 *
 *   PRX-LNG-001 | <decoder focus> | <difficulty>
 *   <stem, wrapped>
 *   A. ...  B. ...  C. ...  D. ...
 *   ANSWER / TEACHING PACKAGE - HIDDEN UNTIL LEARNER SUBMITS
 *   Correct answer: X. <text>
 *   Why this is correct
 *   ...
 *   Why each incorrect answer is wrong
 *   A. ... / B. ... / D. ...
 *   Memory Trick / NCLEX Trap / Clinical Pearl / Clinical Pharmacology /
 *   NCLEX Connection / PrepRX Strategy / Clinical Safety Consideration
 *   Authoritative references
 *   Review status / v2.0 trailer (dropped)
 *
 * One item wraps its difficulty onto the next line.
 *
 *   node scripts/seedNclexV2.js --dry-run
 *   node scripts/seedNclexV2.js
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import topicModel from '../Models/topicSchema.js';
import subtopicModel from '../Models/subTopicSchema.js';
import QuestionModel from '../Models/Question.js';

dotenv.config();

const FILE = process.env.BANK_FILE || path.resolve('D:/my projects/secureroom/preprx/NCLEX.txt');
const TOPIC_TITLE = 'NCLEX Language Decoder';
const DRY_RUN = process.argv.includes('--dry-run');

const PAGE_HEADER = /^PrepRX Strategy Zone - .+ - v2\.0 - DRAFT pending clinical review Page \d+$/i;
const ITEM_HEADER = /^PRX-LNG-(\d{3})\s*\|(.*)$/;
const OPTION_LINE = /^([A-D])\.\s+(.*)$/;
const ANSWER_LINE = /^Correct answer:\s*([A-D])\.\s*(.*)$/i;
const INSTRUCTION_LINE = /^ANSWER \/ TEACHING PACKAGE/i;
const DIFFICULTY_LINE = /^(Hard|Advanced|Advanced NGN.*|Moderate(-Hard)?|Beginner|Intermediate)$/i;

const FIELD_LABELS = [
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Clinical Pharmacology Breakdown:', 'clinicalPharmacologyBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX Strategy:', 'pedrxStrategy'],
    ['Clinical Safety Consideration:', 'clinicalSafetyConsideration'],
];

const matchField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) return { key, value: line.slice(label.length).trim() };
    }
    return null;
};

const normalizeDifficulty = (raw) => {
    const d = (raw || '').trim();
    if (/NGN/i.test(d)) return 'Advanced Clinical Judgment';
    if (/^advanced/i.test(d)) return 'Advanced';
    if (/^moderate\s*-\s*hard/i.test(d)) return 'Moderate-Hard';
    if (/^hard/i.test(d)) return 'Hard';
    if (/^moderate/i.test(d)) return 'Moderate';
    if (/^intermediate/i.test(d)) return 'Intermediate';
    if (/^beginner/i.test(d)) return 'Beginner';
    return 'Intermediate';
};

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const parseDoc = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^\ufeff/, '').trim())
        .filter((line) => line && !PAGE_HEADER.test(line));

    const starts = [];
    lines.forEach((line, idx) => {
        if (ITEM_HEADER.test(line)) starts.push(idx);
    });

    const questions = [];
    for (let s = 0; s < starts.length; s++) {
        const segment = lines.slice(starts[s], starts[s + 1] ?? lines.length);
        const header = segment[0].match(ITEM_HEADER);
        const itemId = `PRX-LNG-${header[1]}`;

        const headerParts = header[2].split('|').map((p) => p.trim());
        if (headerParts.length < 2) throw new Error(`${itemId}: malformed header`);
        const focus = headerParts[0];
        let difficultyRaw = headerParts[headerParts.length - 1];
        let bodyStart = 1;

        if (!difficultyRaw && DIFFICULTY_LINE.test(segment[1] || '')) {
            difficultyRaw = segment[1];
            bodyStart = 2;
        }

        const answerIdx = segment.findIndex((line) => INSTRUCTION_LINE.test(line));
        if (answerIdx < 0) throw new Error(`${itemId}: missing teaching-package marker`);

        const firstOptionIdx = segment.findIndex((line) => OPTION_LINE.test(line));
        if (firstOptionIdx < 0 || firstOptionIdx > answerIdx) throw new Error(`${itemId}: no options found`);

        const stem = segment.slice(bodyStart, firstOptionIdx).join(' ').trim();
        const optionBlock = segment.slice(firstOptionIdx, answerIdx);
        const options = [];
        let currentOption = null;
        for (const line of optionBlock) {
            const om = line.match(OPTION_LINE);
            if (om) {
                currentOption = { letter: om[1], text: om[2].trim() };
                options.push(currentOption);
            } else if (currentOption) {
                currentOption.text = `${currentOption.text} ${line}`.trim();
            }
        }
        if (options.map((o) => o.letter).join('') !== 'ABCD') {
            throw new Error(`${itemId}: expected options A-D, got ${options.map((o) => o.letter).join('')}`);
        }

        const answerLine = segment.slice(answerIdx + 1).find((line) => ANSWER_LINE.test(line));
        if (!answerLine) throw new Error(`${itemId}: missing "Correct answer" line`);
        const correctLetter = answerLine.match(ANSWER_LINE)[1];

        const whyCorrectIdx = segment.findIndex((line) => /^Why this is correct$/i.test(line));
        const whyWrongIdx = segment.findIndex((line) => /^Why each incorrect answer is wrong$/i.test(line));
        if (whyCorrectIdx < 0) throw new Error(`${itemId}: missing "Why this is correct"`);
        if (whyWrongIdx < 0) throw new Error(`${itemId}: missing "Why each incorrect answer is wrong"`);

        const rationale = clean(segment.slice(whyCorrectIdx + 1, whyWrongIdx).join(' '));

        const whyEntries = [];
        let activeWhy = null;
        for (let i = whyWrongIdx + 1; i < segment.length; i++) {
            const line = segment[i];
            if (matchField(line) || /^Authoritative references$/i.test(line) || /^Review status:/i.test(line)) break;
            const om = line.match(OPTION_LINE);
            if (om) {
                activeWhy = { letter: om[1], text: om[2].trim() };
                whyEntries.push(activeWhy);
            } else if (activeWhy) {
                activeWhy.text = `${activeWhy.text} ${line}`.trim();
            }
        }

        const fields = {};
        let activeField = null;
        for (let i = whyWrongIdx + 1; i < segment.length; i++) {
            const line = segment[i];
            if (/^Authoritative references$/i.test(line) || /^Review status:/i.test(line)) break;
            const fm = matchField(line);
            if (fm) {
                activeField = fm.key;
                fields[activeField] = fm.value;
            } else if (activeField) {
                fields[activeField] = `${fields[activeField]} ${line}`.trim();
            }
        }

        options.forEach((o) => { o.text = clean(o.text); });
        const correctOption = options.find((o) => o.letter === correctLetter);
        if (!correctOption) throw new Error(`${itemId}: key ${correctLetter} not among options`);

        // The question schema has no field for Clinical Safety Consideration;
        // keep it attached to the rationale so the learner still sees it.
        let finalRationale = rationale;
        if (fields.clinicalSafetyConsideration) {
            finalRationale = `${finalRationale} Clinical safety consideration: ${clean(fields.clinicalSafetyConsideration)}`;
        }

        questions.push({
            itemId,
            focus,
            question: clean(stem),
            option: options.map((o) => o.text),
            correctAnswer: correctOption.text,
            questionType: 'Single Choice',
            difficulty: normalizeDifficulty(difficultyRaw),
            decoderFocus: focus,
            rationale: clean(finalRationale),
            whyIncorrect: whyEntries.map((e) => `${e.letter}: ${clean(e.text)}`).join(' '),
            memoryTrick: clean(fields.memoryTrick),
            nclexTrap: clean(fields.nclexTrap),
            clinicalPearl: clean(fields.clinicalPearl),
            nclexConnection: clean(fields.nclexConnection),
            pedrxStrategy: clean(fields.pedrxStrategy),
            clinicalPharmacologyBreakdown: fields.clinicalPharmacologyBreakdown
                ? { drugConcept: clean(fields.clinicalPharmacologyBreakdown) }
                : undefined,
        });
    }

    return questions;
};

const validate = (questions) => {
    const errors = [];
    const seen = new Set();
    questions.forEach((q, idx) => {
        const n = q.itemId || `Q${idx + 1}`;
        if (seen.has(q.itemId)) errors.push(`${n}: duplicate item id`);
        seen.add(q.itemId);
        if (!q.question) errors.push(`${n}: empty question`);
        if (q.option.length !== 4) errors.push(`${n}: option count = ${q.option.length}`);
        if (new Set(q.option).size !== q.option.length) errors.push(`${n}: duplicate option text`);
        if (!q.option.includes(q.correctAnswer)) errors.push(`${n}: correct answer not in options`);
        if (!q.rationale) errors.push(`${n}: empty rationale`);
        const whyLetters = (q.whyIncorrect.match(/(?:^|\s)([A-D]):\s/g) || []).map((m) => m.trim()[0]);
        if (whyLetters.length !== 3) errors.push(`${n}: expected 3 incorrect-option explanations, got ${whyLetters.length}`);
        const correctLetter = q.option.indexOf(q.correctAnswer);
        const expected = ['A', 'B', 'C', 'D'].filter((_, i) => i !== correctLetter);
        if (whyLetters.sort().join('') !== expected.sort().join('')) {
            errors.push(`${n}: incorrect-option letters ${whyLetters.join('')} do not match non-key options ${expected.join('')}`);
        }
        for (const key of ['memoryTrick', 'nclexTrap', 'clinicalPearl', 'nclexConnection', 'pedrxStrategy']) {
            if (!q[key]) errors.push(`${n}: empty ${key}`);
        }
        if (!q.clinicalPharmacologyBreakdown?.drugConcept) errors.push(`${n}: empty clinical pharmacology`);
        if (PAGE_HEADER.test(q.question) || /Review status:/i.test(JSON.stringify(q))) {
            errors.push(`${n}: page header / review status leaked into a field`);
        }
        if (!q.decoderFocus) errors.push(`${n}: empty decoder focus`);
    });
    return errors;
};

const parsed = parseDoc();
console.log(`Parsed ${parsed.length} questions from ${FILE}`);

const focusOrder = [];
const byFocus = {};
for (const q of parsed) {
    if (!byFocus[q.focus]) { byFocus[q.focus] = []; focusOrder.push(q.focus); }
    byFocus[q.focus].push(q);
}
console.log(`Decoder focuses: ${focusOrder.length}`);
for (const f of focusOrder) console.log(`  ${f}: ${byFocus[f].length}`);

const errors = validate(parsed);
console.log(`Validation errors: ${errors.length}`);
if (errors.length) {
    errors.slice(0, 25).forEach((e) => console.error('  - ' + e));
    process.exit(1);
}

if (DRY_RUN) {
    const sample = parsed[0];
    console.log('\nSample:', sample.itemId, '| focus:', sample.focus, '| difficulty:', sample.difficulty);
    console.log('question:', sample.question.slice(0, 110));
    console.log('correctAnswer:', sample.correctAnswer);
    console.log('DRY-RUN: no database changes made.');
    process.exit(0);
}

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);

    let topic = await topicModel.findOne({
        title: { $regex: new RegExp('^' + TOPIC_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
    });
    if (!topic) {
        topic = await new topicModel({
            title: TOPIC_TITLE,
            description: 'NCLEX Language Decoder command-word drill bank.',
        }).save();
        console.log(`Created topic "${topic.title}" (${topic._id})`);
    } else {
        console.log(`Using existing topic "${topic.title}" (${topic._id})`);
    }

    const existingSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const existingIds = existingSubs.map((s) => s._id);
    const delQuestions = await QuestionModel.deleteMany({ subTopic: { $in: existingIds } });
    const delSubs = await subtopicModel.deleteMany({ topicId: topic._id });
    console.log(`Deleted ${delSubs.deletedCount} old subtopics and ${delQuestions.deletedCount} old questions`);

    let inserted = 0;
    for (const focus of focusOrder) {
        const items = byFocus[focus];
        const sub = await new subtopicModel({
            topicId: topic._id,
            title: focus,
            content: `${focus} - command-word drill. Lesson questions: ${items.length}.`,
        }).save();
        const docs = items.map(({ itemId, focus: _f, ...doc }) => ({ ...doc, subTopic: sub._id }));
        const res = await QuestionModel.insertMany(docs);
        inserted += res.length;
    }

    const newSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const newIds = newSubs.map((s) => s._id);
    const total = await QuestionModel.countDocuments({ subTopic: { $in: newIds } });
    console.log(`Inserted ${inserted} questions across ${newSubs.length} subtopics`);
    console.log(`Topic questions now: ${total}`);
    console.log('Total questions collection:', await QuestionModel.countDocuments({}));

    await mongoose.disconnect();
    console.log('Done.');
};

run().catch((e) => { console.error(e); process.exit(1); });
