import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import StrategyQuestionModel from '../Models/StrategyQuestion.js';

dotenv.config();

const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\newapp\\sata.txt';
const DRY_RUN = process.argv.includes('--dry-run');

const STRATEGY_TAB = 'SATA Boot Camp';
const SUB_CATEGORY = 'SATA Boot Camp';
const PRIMARY_FRAMEWORK = 'SATA Boot Camp';
const SECONDARY_FRAMEWORK = 'Select All That Apply';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const reTopic = /^Topic:\s*(.*)$/i;
const reOption = /^([A-F])\.\s+(.*)$/;
const reAnswerPkg = /^Answer\s*\/\s*Teaching\s*Package/i;
const reDifficulty = /^Difficulty:\s*(.*)$/i;
const reCorrectSelections = /^Correct\s*Selections?:\s*(.*)$/i;
const reNumberCorrect = /^Number\s*Correct:/i;

const VALID_DIFFICULTIES = [
    'Beginner', 'Intermediate', 'Advanced', 'NGN Case Study', 'Expert',
    'Moderate', 'Hard', 'Moderate-Hard', 'Advanced Clinical Judgment'
];

const normalizeDifficulty = (raw) => {
    let d = (raw || '').trim();
    if (/NGN/i.test(d)) d = 'Advanced Clinical Judgment';
    if (!VALID_DIFFICULTIES.includes(d)) d = 'Intermediate';
    return d;
};

const LABELS = [
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Clinical Pharmacology Breakdown:', 'clinicalPharmacologyBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX SATA Strategy:', 'preprxTestTakingStrategy'],
    ['Authoritative Reference Validation:', 'authoritativeReferenceValidation']
];

const stripOptionText = (raw) => {
    // "A. option text - explanation" -> explanation (after first " - ")
    let t = raw.trim();
    const sep = t.indexOf(' - ');
    if (sep >= 0) t = t.slice(sep + 3).trim();
    return t.replace(/^Correct\s*-\s*/i, '').trim();
};

const lastKey = (obj) => Object.keys(obj)[Object.keys(obj).length - 1];

const parseQuestions = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, '').trim());

    const questions = [];
    let q = null;        // current question
    let phase = 'idle';  // idle | stem | options | teaching
    let block = null;    // null | 'selected' | 'incorrect'
    let field = null;    // active teaching string field key, or null

    const flush = () => {
        if (q) questions.push(q);
        q = null;
    };

    for (const line of lines) {
        if (!line) { field = null; block = null; continue; }

        const tm = line.match(reTopic);
        if (tm) {
            flush();
            q = {
                topic: tm[1].trim(),
                stemLines: [],
                options: [],
                letters: [],
                correctLetters: [],
                difficulty: '',
                rationale: '',
                selectedMap: {},
                incorrectMap: {},
                incorrectProse: '',
                memoryTrick: '',
                nclexTrap: '',
                clinicalPearl: '',
                clinicalPharmacologyBreakdown: '',
                nclexConnection: '',
                preprxTestTakingStrategy: '',
                authoritativeReferenceValidation: ''
            };
            phase = 'stem';
            block = null;
            field = null;
            continue;
        }

        if (!q) continue;

        const reOpt = line.match(reOption);

        if (phase === 'stem') {
            if (reOpt && LETTERS[q.options.length] === reOpt[1]) {
                phase = 'options';
                q.letters.push(reOpt[1]);
                q.options.push(reOpt[2].trim());
                continue;
            }
            q.stemLines.push(line);
            continue;
        }

        if (phase === 'options') {
            if (reAnswerPkg.test(line)) { phase = 'teaching'; field = null; block = null; continue; }
            if (reOpt && q.options.length < 6 && LETTERS[q.options.length] === reOpt[1]) {
                q.letters.push(reOpt[1]);
                q.options.push(reOpt[2].trim());
                continue;
            }
            if (q.options.length) q.options[q.options.length - 1] += ' ' + line;
            continue;
        }

        // ---- teaching phase ----
        if (reAnswerPkg.test(line)) continue;

        const d = line.match(reDifficulty);
        if (d) { q.difficulty = d[1].trim(); field = null; block = null; continue; }

        const cs = line.match(reCorrectSelections);
        if (cs) {
            q.correctLetters = (cs[1].match(/[A-F]/g) || []).filter((v, i, a) => a.indexOf(v) === i);
            field = null; block = null; continue;
        }

        if (reNumberCorrect.test(line)) { field = null; block = null; continue; }

        if (line.startsWith('Detailed Rationale:')) {
            q.rationale = line.slice('Detailed Rationale:'.length).trim();
            field = 'rationale'; block = null; continue;
        }
        if (line.startsWith('Why Each Selected Answer Is Correct:')) {
            block = 'selected'; field = null; continue;
        }
        if (line.startsWith('Why Each Incorrect Answer Is Wrong:')) {
            block = 'incorrect'; field = null; q.incorrectProse = ''; continue;
        }

        let matchedLabel = false;
        for (const [label, key] of LABELS) {
            if (line.startsWith(label)) {
                q[key] = line.slice(label.length).trim();
                field = key; block = null; matchedLabel = true;
                break;
            }
        }
        if (matchedLabel) continue;

        // content / continuation lines
        if (block === 'selected' || block === 'incorrect') {
            if (reOpt) {
                const map = block === 'selected' ? q.selectedMap : q.incorrectMap;
                map[reOpt[1]] = stripOptionText(reOpt[2]);
                field = null;
            } else if (block === 'selected' && Object.keys(q.selectedMap).length) {
                const k = lastKey(q.selectedMap);
                q.selectedMap[k] += ' ' + line;
            } else if (block === 'incorrect' && Object.keys(q.incorrectMap).length) {
                const k = lastKey(q.incorrectMap);
                q.incorrectMap[k] += ' ' + line;
            } else {
                q.incorrectProse = q.incorrectProse ? q.incorrectProse + ' ' + line : line;
            }
            continue;
        }

        if (field) q[field] = q[field] ? q[field] + ' ' + line : line;
    }
    flush();
    return questions;
};

const buildQuestionDoc = (q, index) => {
    const question = q.stemLines.join(' ').trim();

    const optionText = (letter) => {
        const i = q.letters.indexOf(letter);
        return i >= 0 ? q.options[i] : '';
    };

    const correctAnswers = q.correctLetters.map((l) => optionText(l)).filter(Boolean);

    // whyIncorrect: colon format "{L}: {option} - {explanation}" so the drill parser (A: ... B: ...) can split rows
    const incorrectLetters = LETTERS.filter((l) => q.letters.includes(l) && !q.correctLetters.includes(l));
    let whyIncorrect = '';
    if (incorrectLetters.length) {
        whyIncorrect = incorrectLetters
            .map((l) => {
                const expl = q.incorrectMap[l] || '';
                return `${l}: ${optionText(l)} - ${expl}`.trim();
            })
            .join(' ');
    } else {
        whyIncorrect = q.incorrectProse;
    }

    // whySelectedCorrect: colon format "{L}: {option} - {explanation}" for each correct selection
    const whySelectedCorrect = q.correctLetters
        .map((l) => {
            const expl = q.selectedMap[l] || '';
            return `${l}: ${optionText(l)} - ${expl}`.trim();
        })
        .filter(Boolean)
        .join(' ');

    // optionEvaluations: per-option True/False + explanation (schema-supported, unused by UI)
    const optionEvaluations = q.letters.map((l) => ({
        optionText: optionText(l),
        isTrue: q.correctLetters.includes(l),
        explanation: q.selectedMap[l] || q.incorrectMap[l] || ''
    }));

    return {
        strategyTab: STRATEGY_TAB,
        subCategory: SUB_CATEGORY,
        question,
        options: q.options,
        correctAnswers,
        difficultyLevel: normalizeDifficulty(q.difficulty),
        rationale: q.rationale,
        whyIncorrect,
        whySelectedCorrect,
        memoryTrick: q.memoryTrick,
        nclexTrap: q.nclexTrap,
        clinicalPearl: q.clinicalPearl,
        clinicalPharmacologyBreakdown: q.clinicalPharmacologyBreakdown,
        nclexConnection: q.nclexConnection,
        preprxTestTakingStrategy: q.preprxTestTakingStrategy,
        authoritativeReferenceValidation: q.authoritativeReferenceValidation,
        primaryFramework: PRIMARY_FRAMEWORK,
        secondaryFramework: SECONDARY_FRAMEWORK,
        optionEvaluations
    };
};

// Same parser the drill UI uses for "Why other answers are wrong:" rows
const uiParseWrongAnswers = (raw) => {
    if (!raw) return [];
    const parts = raw.match(/([A-F]):\s*([\s\S]*?)(?=\s+[A-F]:|$)/g) || [];
    return parts
        .map((part) => {
            const m = part.match(/^([A-F]):\s*([\s\S]*)$/);
            if (!m) return null;
            return { letter: m[1], text: m[2].trim() };
        })
        .filter(Boolean);
};

const questions = parseQuestions();

// ---- validation ----
const errors = [];
questions.forEach((q, idx) => {
    const n = idx + 1;
    const doc = buildQuestionDoc(q, idx);

    if (!doc.question) errors.push(`Q${n}: empty question "${q.topic}"`);
    if (doc.options.length !== 6) errors.push(`Q${n}: options not 6 -> ${doc.options.length} (${q.topic})`);
    if (doc.correctAnswers.length < 1 || doc.correctAnswers.length > 6)
        errors.push(`Q${n}: correctAnswers count ${doc.correctAnswers.length}`);
    doc.correctAnswers.forEach((ca) => { if (!doc.options.includes(ca)) errors.push(`Q${n}: correct answer not in options -> "${ca}"`); });
    if (q.correctLetters.some((l) => !q.letters.includes(l))) errors.push(`Q${n}: correct letter not in option letters: ${q.correctLetters}`);
    if (!doc.rationale.trim()) errors.push(`Q${n}: empty rationale`);
    if (!doc.whyIncorrect.trim()) errors.push(`Q${n}: empty whyIncorrect`);
    if (!doc.whySelectedCorrect.trim()) errors.push(`Q${n}: empty whySelectedCorrect`);
    if (!VALID_DIFFICULTIES.includes(doc.difficultyLevel)) errors.push(`Q${n}: bad difficulty "${doc.difficultyLevel}"`);
    if (doc.optionEvaluations.length !== 6) errors.push(`Q${n}: optionEvaluations not 6`);
    if (doc.optionEvaluations.some((e) => !e.optionText)) errors.push(`Q${n}: empty optionEvaluation optionText`);

    // UI-parity check: colon parser must reproduce exactly the incorrect letters
    const rows = uiParseWrongAnswers(doc.whyIncorrect);
    const incorrectLetters = LETTERS.filter((l) => q.letters.includes(l) && !q.correctLetters.includes(l));
    if (incorrectLetters.length > 0) {
        const rowLetters = rows.map((r) => r.letter);
        const expected = incorrectLetters.join('');
        if (rowLetters.join('') !== expected) {
            errors.push(`Q${n}: UI parse mismatch. expected [${expected}] got [${rowLetters.join('')}] why="${doc.whyIncorrect.slice(0, 120)}"`);
        }
    }
});

console.log(`Parsed ${questions.length} questions`);
if (DRY_RUN || errors.length) {
    console.error(`Validation errors: ${errors.length}`);
    errors.slice(0, 30).forEach((e) => console.error('  - ' + e));
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(errors.length ? 1 : 0);
}

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const before = await StrategyQuestionModel.countDocuments({ strategyTab: STRATEGY_TAB });
    console.log(`Existing "${STRATEGY_TAB}" docs before: ${before}`);

    await StrategyQuestionModel.deleteMany({ strategyTab: STRATEGY_TAB });
    console.log(`Deleted old "${STRATEGY_TAB}" docs`);

    const docs = questions.map((q, i) => buildQuestionDoc(q, i));
    const inserted = await StrategyQuestionModel.insertMany(docs);
    console.log(`Inserted ${inserted.length} questions`);

    const dist = {};
    inserted.forEach((d) => { dist[d.difficultyLevel] = (dist[d.difficultyLevel] || 0) + 1; });
    console.log('Difficulty distribution:', dist);

    const verify = await StrategyQuestionModel.countDocuments({ strategyTab: STRATEGY_TAB });
    console.log(`Verify: ${verify} docs in DB (expected ${questions.length})`);

    // print 3 sample questions for sanity
    console.log('\nSample questions:');
    inserted.slice(0, 3).forEach((d, i) => {
        console.log(`  [${i + 1}] ${d.question}`);
        console.log(`      options=${d.options.length} correct=${d.correctAnswers.length} diff=${d.difficultyLevel}`);
        console.log(`      whyIncorrect=${String(d.whyIncorrect).slice(0, 110)}...`);
    });

    const weird = await StrategyQuestionModel.countDocuments({
        strategyTab: STRATEGY_TAB,
        $or: [
            { rationale: /Authoritative Reference Validation/i },
            { question: /Answer \/ Teaching Package/i }
        ]
    });
    console.log('\nDocs with leaked spec text:', weird);

    console.log('\nDone.');
    process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });