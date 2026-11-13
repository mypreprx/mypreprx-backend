import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import BehavioralQuestionModel from '../Models/BehavioralQuestion.js';

dotenv.config();

const TOPIC = process.env.SEED_TOPIC || 'Case Studies';
const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\newapp\\casestudy.txt';
const DRY_RUN = process.argv.includes('--dry-run');

// ---------- label classifiers ----------
const reCase = /^(?:Case Study|Clinical Scenario) (\d+):\s*(.+?)\s*$/;
const reQuestion = /^Question (\d+)(?:\s*-\s*(.+?))?(?:\s*\(.*\))?\s*$/;
const reOption = /^([A-F])\.\s+(.*)$/;
const reSkipBlock = /^(Answer \/ Teaching Package - HIDDEN UNTIL SUBMISSION|Authoritative Reference Validation|Validation Result:)/i;
const rePageHeader = /^PrepRX - .*Page \d+$/i;
const FIELD_LABELS = [
    ['Correct Answer:', 'correctAnswerLine'],
    ['Detailed Rationale:', 'rationale'],
    ['Why Each Incorrect Answer Is Wrong:', 'whyIncorrect'],
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Cultural Sensitivity Breakdown:', 'clinicalBreakdown'],
    ['Clinical Pharmacology Breakdown:', 'clinicalBreakdown'],
    ['Clinical Breakdown:', 'clinicalBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX CULTURE FAST+ Strategy:', 'preprxStrategy'],
    ['PrepRX PSYCH DRUG FAST+ Strategy:', 'preprxStrategy'],
    ['PrepRX CJ FAST+ Strategy:', 'preprxStrategy'],
    ['Therapeutic Communication Breakdown:', 'clinicalBreakdown'],
    ['PrepRX TALK FAST+ Strategy:', 'preprxStrategy'],
    ['Current NGN format:', 'currentFormat'],
    ['Current format:', 'currentFormat'],
    ['Difficulty:', 'difficulty'],
    ['Clinical Judgment:', 'ncjmmStep']
];
const HEADER_LABELS = [
    ['2026 Client Needs ', 'clientNeeds'],
    ['Client Needs ', 'clientNeeds'],
    ['Primary Client Needs ', 'clientNeeds'],
    ['Client ', 'client'],
    ['Clinical Context ', 'clinicalConcern'],
    ['Presenting Communication Challenge ', 'presentingChange'],
    ['Observed Cues ', 'initialNursingFocus'],
    ['Therapeutic Focus ', 'primaryConcern'],
    ['Unfolding scenario: ', 'unfoldingChart'],
    ['Setting ', 'setting'],
    ['Primary Concern ', 'primaryConcern'],
    ['History / Context ', 'historyContext'],
    ['History ', 'historyContext'],
    ['Initial Nursing Focus ', 'initialNursingFocus'],
    ['Initial chart: ', 'initialChart'],
    ['Unfolding chart: ', 'unfoldingChart'],
    ['Psychiatric Diagnosis ', 'psychiatricDiagnosis'],
    ['Medication Focus ', 'medicationFocus'],
    ['Presenting Change ', 'presentingChange'],
    ['Clinical Concern ', 'clinicalConcern'],
    ['Age ', 'age'],
    ['Gender ', 'gender'],
    ['Chief Concern ', 'chiefConcern'],
    ['Cultural/Context Cue ', 'culturalContextCue'],
    ['Cultural/Conte xt Cue ', 'culturalContextCue'],
    ['Assessment ', 'assessment'],
    ['Plan ', 'plan'],
    ['NCLEX Focus ', 'nclexFocus']
];

const classify = (line) => {
    if (reCase.test(line)) {
        const m = line.match(reCase);
        return { type: 'case', num: parseInt(m[1], 10), title: m[2] };
    }
    if (reQuestion.test(line)) {
        const m = line.match(reQuestion);
        return { type: 'question', num: parseInt(m[1], 10), step: m[2] };
    }
    if (reSkipBlock.test(line)) return { type: 'skip' };
    if (rePageHeader.test(line)) return { type: 'pageheader' };
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) {
            return { type: 'field', key, value: line.slice(label.length).trim() };
        }
    }
    const opt = line.match(reOption);
    if (opt) return { type: 'option', letter: opt[1], text: opt[2].trim() };
    for (const [label, key] of HEADER_LABELS) {
        if (line.startsWith(label) || line === label.trim()) {
            return { type: 'header', key, value: line.slice(label.length).trim() };
        }
    }
    return { type: 'continuation' };
};

// ---------- parse ----------
const raw = fs.readFileSync(FILE, 'utf8');
const rawLines = raw.split(/\r?\n/).map(l => l.replace(/^﻿/, '').trim());

// Merge a line with the next when it is a (strict) prefix of a known header label.
// Handles hard line breaks that split a header label across two physical lines
// (e.g. "Cultural/Conte" + "xt Cue" -> "Cultural/Conte xt Cue").
const headerLabelBases = HEADER_LABELS.map(([label]) => label.replace(/\s+$/, ''));
const lines = [];
for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const isPrefixFragment = line.length > 1 && headerLabelBases.some(
        (base) => base.length > line.length && base.startsWith(line)
    );
    if (isPrefixFragment && i + 1 < rawLines.length) {
        lines.push((line + ' ' + rawLines[i + 1]).trim());
        i++;
    } else {
        lines.push(line);
    }
}

const cases = [];
const errors = [];
let currentCase = null;
let currentQuestion = null;
let currentField = null; // 'SKIP' | 'questionText' | {kind:'q'|'h', key} | null
let pastOptions = false;
let pendingSteps = []; // "Question N - Step" headings recorded in order for the current case

const finalizeQuestion = () => {
    if (!currentQuestion) return;
    const q = currentQuestion;
    const rawAnswer = q.correctAnswerLine || '';
    const periodMatches = rawAnswer.match(/[A-F]\./g);
    const letters = (periodMatches && periodMatches.length
        ? periodMatches.map((m) => m[0])
        : rawAnswer.split(',').map((t) => t.trim().charAt(0).toUpperCase())
    ).filter((c) => /[A-F]/.test(c));
    const correctAnswers = letters.map((l) => q.optionMap[l]).filter(Boolean);
    if (!q.questionText || !q.questionText.trim()) errors.push(`Case ${currentCase?.caseNumber}: Q${q.num} missing questionText`);
    if (!q.options || q.options.length < 2) errors.push(`Case ${currentCase?.caseNumber}: Q${q.num} has <2 options`);
    if (correctAnswers.length === 0) errors.push(`Case ${currentCase?.caseNumber}: Q${q.num} has no resolvable correct answer (raw: "${q.correctAnswerLine}")`);
    const bad = correctAnswers.filter((a) => !q.options.includes(a));
    if (bad.length) errors.push(`Case ${currentCase?.caseNumber}: Q${q.num} correct answer not in options: ${JSON.stringify(bad)}`);
    const doc = {
        ncjmmStep: q.step,
        currentFormat: q.currentFormat,
        difficulty: q.difficulty,
        questionText: q.questionText.trim(),
        options: q.options,
        correctAnswers,
        rationale: q.rationale.trim(),
        whyIncorrect: q.whyIncorrect.trim(),
        memoryTrick: q.memoryTrick.trim(),
        nclexTrap: q.nclexTrap.trim(),
        clinicalPearl: q.clinicalPearl.trim(),
        clinicalBreakdown: q.clinicalBreakdown.trim(),
        nclexConnection: q.nclexConnection.trim(),
        preprxStrategy: q.preprxStrategy.trim()
    };
    currentCase.questions.push(doc);
};

const finalizeCase = () => {
    if (!currentCase) return;
    finalizeQuestion();
    const c = currentCase;
    // Question headings are recorded in source order. Attach them to the
    // parsed items in order (their physical position can vary near page breaks).
    c.questions.forEach((q, i) => {
        const h = pendingSteps[i];
        if (h) {
            q.ncjmmStep = h.step;
        }
    });
    const parts = [];
    if (c.client) parts.push(`Client: ${c.client}`);
    if (c.gender) parts.push(`Gender: ${c.gender}`);
    if (c.age) parts.push(`Age: ${c.age}`);
    if (c.setting) parts.push(`Setting: ${c.setting}`);
    if (c.primaryConcern) parts.push(`Primary Concern: ${c.primaryConcern}`);
    if (c.chiefConcern) parts.push(`Chief Concern: ${c.chiefConcern}`);
    if (c.historyContext) parts.push(`History/Context: ${c.historyContext}`);
    if (c.initialNursingFocus) parts.push(`Initial Nursing Focus: ${c.initialNursingFocus}`);
    if (c.clientNeeds) parts.push(`Client Needs: ${c.clientNeeds}`);
    if (c.initialChart) parts.push(`Initial chart: ${c.initialChart}`);
    if (c.psychiatricDiagnosis) parts.push(`Psychiatric Diagnosis: ${c.psychiatricDiagnosis}`);
    if (c.medicationFocus) parts.push(`Medication Focus: ${c.medicationFocus}`);
    if (c.presentingChange) parts.push(`Presenting Change: ${c.presentingChange}`);
    if (c.clinicalConcern) parts.push(`Clinical Concern: ${c.clinicalConcern}`);
    if (c.unfoldingChart) parts.push(`Unfolding chart: ${c.unfoldingChart}`);
    if (c.culturalContextCue) parts.push(`Cultural/Context Cue: ${c.culturalContextCue}`);
    if (c.assessment) parts.push(`Assessment: ${c.assessment}`);
    if (c.plan) parts.push(`Plan: ${c.plan}`);
    if (c.nclexFocus) parts.push(`NCLEX Focus: ${c.nclexFocus}`);
    const clinicalScenario = parts.join('\n\n');
    if (!clinicalScenario.trim()) errors.push(`Case ${c.caseNumber}: empty clinicalScenario`);
    if (c.questions.length === 0) errors.push(`Case ${c.caseNumber}: no questions parsed`);
    cases.push({
        topic: TOPIC,
        caseNumber: c.caseNumber,
        caseTitle: c.caseTitle,
        client: c.client,
        gender: c.gender,
        age: c.age,
        setting: c.setting,
        primaryConcern: c.primaryConcern,
        chiefConcern: c.chiefConcern,
        historyContext: c.historyContext,
        initialNursingFocus: c.initialNursingFocus,
        clientNeeds: c.clientNeeds,
        initialChart: c.initialChart,
        psychiatricDiagnosis: c.psychiatricDiagnosis,
        medicationFocus: c.medicationFocus,
        presentingChange: c.presentingChange,
        clinicalConcern: c.clinicalConcern,
        unfoldingChart: c.unfoldingChart,
        culturalContextCue: c.culturalContextCue,
        assessment: c.assessment,
        plan: c.plan,
        nclexFocus: c.nclexFocus,
        clinicalScenario,
        questions: c.questions,
        createdAt: new Date()
    });
};

const newQuestion = (step, num) => ({
    num,
    step,
    currentFormat: '',
    difficulty: '',
    questionText: '',
    options: [],
    optionMap: {},
    correctAnswerLine: '',
    rationale: '',
    whyIncorrect: '',
    memoryTrick: '',
    nclexTrap: '',
    clinicalPearl: '',
    clinicalBreakdown: '',
    nclexConnection: '',
    preprxStrategy: ''
});

const applyHeader = (key, value) => {
    const cur = (currentCase[key] ? currentCase[key] + ' ' : '') + value;
    if (key === 'chiefConcern') {
        const idx = cur.indexOf(' History ');
        if (idx !== -1) {
            currentCase.historyContext = cur.slice(idx + ' History '.length).trim();
            currentCase.chiefConcern = cur.slice(0, idx).trim();
        } else {
            currentCase.chiefConcern = cur.trim();
        }
    } else if (key === 'culturalContextCue') {
        const idx = cur.indexOf(' Assessment ');
        if (idx !== -1) {
            currentCase.assessment = cur.slice(idx + ' Assessment '.length).trim();
            currentCase.culturalContextCue = cur.slice(0, idx).trim();
        } else {
            currentCase.culturalContextCue = cur.trim();
        }
    } else {
        currentCase[key] = cur.trim();
    }
};

const appendToField = (text) => {
    if (currentField === 'SKIP') return;
    if (currentField === 'questionText') { currentQuestion.questionText += (currentQuestion.questionText ? ' ' : '') + text; return; }
    if (currentField === null) return;
    if (currentField.kind === 'q') {
        const cur = currentQuestion[currentField.key] || '';
        currentQuestion[currentField.key] = cur ? cur + ' ' + text : text;
    } else {
        applyHeader(currentField.key, text);
    }
};

for (const line of lines) {
    const cls = classify(line);

    if (cls.type === 'case') {
        finalizeCase();
        pendingSteps = [];
        currentCase = {
            caseNumber: cls.num,
            caseTitle: cls.title,
            client: '', gender: '', age: '', setting: '', primaryConcern: '', chiefConcern: '', historyContext: '',
            initialNursingFocus: '', clientNeeds: '', initialChart: '',
            psychiatricDiagnosis: '', medicationFocus: '', presentingChange: '',
            clinicalConcern: '', unfoldingChart: '',
            culturalContextCue: '', assessment: '', plan: '', nclexFocus: '',
            questions: []
        };
        currentQuestion = null;
        currentField = null;
        pastOptions = false;
        continue;
    }

    if (currentCase === null) continue; // skip doc preamble

    if (cls.type === 'question') {
        // Question headings can appear before, after, or inside an item body in
        // the source PDF. Record them in order; attach them to this case's items
        // after the case has been parsed.
        pendingSteps.push({ num: cls.num, step: cls.step });
        continue;
    }

    if (cls.type === 'skip') {
        // The "Answer / Teaching Package" marker can be interleaved with the
        // item body; ignore it entirely. Real ARV/validation blocks still switch
        // to skip mode.
        if (line.startsWith('Answer / Teaching Package')) continue;
        currentField = 'SKIP';
        continue;
    }

    if (cls.type === 'pageheader') {
        // Page-break marker: ignore the line but keep the current field active
        // (it can appear inside a field's multi-line content, e.g. between a
        // header label and its continuation text).
        continue;
    }

    if (cls.type === 'option') {
        // Only treat a lettered line as an answer option while in the item body.
        // Teaching fields (rationale, whyIncorrect, ...) can contain lines that
        // start with "A." / "D." as continuation text and must not overwrite options.
        const inOptionBody = currentField === null || currentField === 'questionText';
        if (currentQuestion && !pastOptions && inOptionBody) {
            currentQuestion.options.push(cls.text);
            currentQuestion.optionMap[cls.letter] = cls.text;
            currentField = null;
        } else {
            appendToField(line.trim());
        }
        continue;
    }

    if (cls.type === 'field') {
        if (cls.key === 'currentFormat') {
            // "Current format:" marks the start of an item body. If the current
            // question has already begun (some files have no explicit question
            // heading before the body), start a fresh question.
            const hasStarted = currentQuestion && (
                currentQuestion.currentFormat ||
                currentQuestion.questionText.trim() ||
                currentQuestion.options.length > 0
            );
            if (!currentQuestion || hasStarted) {
                finalizeQuestion();
                const nextNum = (currentCase?.questions.length || 0) + 1;
                currentQuestion = newQuestion('', nextNum);
            }
            currentQuestion.currentFormat = cls.value;
            currentField = null;
            // A marker may precede the item body; the body always starts here.
            pastOptions = false;
        } else if (cls.key === 'difficulty') {
            const m = cls.value.match(/Clinical Judgment:\s*(.+)$/i);
            if (m) {
                currentQuestion.step = m[1].trim();
                currentQuestion.difficulty = cls.value.slice(0, m.index).replace(/^Difficulty:\s*/i, '').trim();
            } else {
                currentQuestion.difficulty = cls.value.replace(/^Difficulty:\s*/i, '').trim();
            }
            currentField = { kind: 'q', key: 'difficulty' };
        } else {
            currentQuestion[cls.key] = cls.value;
            currentField = { kind: 'q', key: cls.key };
            // Answer choices always precede the keyed answer. Switch out of option
            // mode here so teaching text that starts with "A." is not captured as
            // an option (the marker may be interleaved elsewhere in the item).
            if (cls.key === 'correctAnswerLine') pastOptions = true;
        }
        continue;
    }

    if (cls.type === 'header') {
        if (cls.key === 'age') {
            const m = cls.value.match(/Gender\s+(\S+)/i);
            if (m) {
                currentCase.gender = m[1];
                currentCase.age = cls.value.slice(0, m.index).trim();
            } else {
                currentCase.age = cls.value;
            }
        } else {
            applyHeader(cls.key, cls.value);
        }
        currentField = { kind: 'h', key: cls.key };
        continue;
    }

    // continuation
    if (currentField === null && currentQuestion && !pastOptions) {
        currentField = 'questionText';
    }
    appendToField(line.trim());
}

finalizeCase();

// ---------- report / validate ----------
const TEACHING_FIELDS = ['rationale', 'whyIncorrect', 'memoryTrick', 'nclexTrap', 'clinicalPearl', 'clinicalBreakdown', 'nclexConnection', 'preprxStrategy'];
for (const c of cases) {
    for (const q of c.questions) {
        for (const f of TEACHING_FIELDS) {
            if (!q[f] || !String(q[f]).trim()) errors.push(`Case ${c.caseNumber}: Q${q.num} empty field "${f}"`);
        }
        const blob = JSON.stringify(q).toLowerCase();
        if (blob.includes('authoritative reference validation') || blob.includes('strict validation hierarchy') || blob.includes('arv leak')) {
            errors.push(`Case ${c.caseNumber}: Q${q.num} ARV leaked into data`);
        }
    }
}

const totalQuestions = cases.reduce((s, c) => s + c.questions.length, 0);
console.log(`Parsed ${cases.length} cases, ${totalQuestions} questions for topic "${TOPIC}"`);
const qCounts = cases.map((c) => c.questions.length);
const minQ = qCounts.length ? Math.min(...qCounts) : 0;
const maxQ = qCounts.length ? Math.max(...qCounts) : 0;
console.log(`Questions per case: min=${minQ}, max=${maxQ}`);
const zeroQ = cases.filter((c) => c.questions.length === 0).length;
if (zeroQ) console.log(`WARNING: ${zeroQ} case(s) have 0 questions`);
console.log(`Validation errors: ${errors.length}`);
if (errors.length) {
    errors.slice(0, 30).forEach((e) => console.error('  - ' + e));
}

if (DRY_RUN || errors.length) {
    if (!errors.length && cases.length) {
        const s = cases[0];
        console.log('\n--- SAMPLE CASE 1 ---');
        console.log('caseTitle:', s.caseTitle);
        console.log('clinicalScenario:\n' + s.clinicalScenario);
        const q = s.questions[0];
        console.log('\nQ1 step:', q.ncjmmStep, '| format:', q.currentFormat, '| difficulty:', q.difficulty);
        console.log('Q1 text:', q.questionText);
        console.log('Q1 options:', q.options);
        console.log('Q1 correct:', q.correctAnswers);
        console.log('Q1 rationale:', q.rationale.slice(0, 120));
        console.log('Q1 whyIncorrect:', q.whyIncorrect.slice(0, 120));
        console.log('Q1 memoryTrick:', q.memoryTrick.slice(0, 80));
        console.log('Q1 nclexTrap:', q.nclexTrap.slice(0, 120));
        console.log('Q1 clinicalPearl:', q.clinicalPearl.slice(0, 120));
        console.log('Q1 clinicalBreakdown:', q.clinicalBreakdown.slice(0, 120));
        console.log('Q1 nclexConnection:', q.nclexConnection.slice(0, 120));
        console.log('Q1 preprxStrategy:', q.preprxStrategy.slice(0, 80));
    }
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(errors.length ? 1 : 0);
}

// ---------- seed ----------
const mongodbUrl = process.env.MONGODB_URL || (() => {
    const envRaw = fs.readFileSync('.env', 'utf8');
    for (const l of envRaw.split(/\r?\n/)) {
        const t = l.trim();
        if (t && !t.startsWith('#') && t.startsWith('MONGODB_URL=')) return t.slice('MONGODB_URL='.length).trim();
    }
    return null;
})();
if (!mongodbUrl) throw new Error('MONGODB_URL not found');

await mongoose.connect(mongodbUrl);
console.log('Connected to MongoDB');

const existing = await BehavioralQuestionModel.distinct('topic');
console.log('Existing topics in BehavioralQuestion:', existing);

const delRes = await BehavioralQuestionModel.deleteMany({ topic: TOPIC });
console.log(`Deleted ${delRes.deletedCount} existing "${TOPIC}" docs`);

const inserted = await BehavioralQuestionModel.insertMany(cases);
console.log(`Inserted ${inserted.length} new "${TOPIC}" cases (${totalQuestions} questions)`);

const verify = await BehavioralQuestionModel.aggregate([
    { $match: { topic: TOPIC } },
    { $project: { nq: { $size: '$questions' } } },
    { $group: { _id: null, cases: { $sum: 1 }, questions: { $sum: '$nq' }, minQ: { $min: '$nq' }, maxQ: { $max: '$nq' } } }
]);
console.log('Verification aggregate:', JSON.stringify(verify[0]));

const withARV = await BehavioralQuestionModel.countDocuments({ topic: TOPIC, authoritativeReferenceValidation: { $exists: true } });
console.log('Docs with leftover authoritativeReferenceValidation field:', withARV);

await mongoose.disconnect();
console.log('\nDone.');
