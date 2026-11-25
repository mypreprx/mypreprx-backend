/**
 * Seeds the Study Zone -> Priority Practice cases from the v2.0 export
 * (Hypertension.txt: 50 cases x 6 questions = 300 items, PRX-HTD-001 .. PRX-HTD-300).
 *
 * Each document in the source is one clinical case. The case narrative is
 * repeated at the start of all six question stems; this script recovers it from
 * the longest common prefix of the six stems and stores it once as
 * scenarioNarrative. The per-question stem is the text that follows it.
 *
 * Teaching package -> schema mapping (the priority-practice schema has fewer
 * fields than the document, so every section is preserved):
 *   rationale              = "Why this is correct" + pharmacology + safety
 *   distractorExplanation  = "Why each incorrect answer is wrong"
 *   keyTakeaway            = Memory Trick + Clinical Pearl + NCLEX Trap
 *   strategyTip            = PrepRX Strategy + NCLEX Connection
 *
 * Only the old "Pharmacological Management of Hypertension and Diabetes" case
 * (and any cases previously created by this script) are replaced.
 *
 *   node scripts/seedHtnCasesV2.js --dry-run
 *   node scripts/seedHtnCasesV2.js
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PirPractice from '../Models/piriorityPracticeSchema.js';

dotenv.config();

const FILE = process.env.BANK_FILE || path.resolve('D:/my projects/secureroom/preprx/Hypertension.txt');
const DRY_RUN = process.argv.includes('--dry-run');
const OLD_TITLE = 'Pharmacological Management of Hypertension and Diabetes';
const NEW_TITLE_PREFIX = 'Hypertension & Diabetes - Case ';
const FALLBACK_SUBTOPIC = new mongoose.Types.ObjectId('69a61b4cc7a0a54eb1e1176a');

const PAGE_HEADER = /^PrepRX Strategy Zone - .+ - v2\.0 - DRAFT pending clinical review Page \d+$/i;
const ITEM_HEADER = /^PRX-HTD-(\d{3})\s*\|(.*)$/;
const OPTION_LINE = /^([A-D])\.\s+(.*)$/;
const ANSWER_LINE = /^Correct answer:\s*([A-D])\.\s*(.*)$/i;
const INSTRUCTION_LINE = /^ANSWER \/ TEACHING PACKAGE/i;
const KNOWN_DIFF = 'Advanced NGN Clinical Judgment';

const FIELD_LABELS = [
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Clinical Pharmacology Breakdown:', 'clinicalPharmacologyBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX Strategy:', 'preprxStrategy'],
    ['Clinical Safety Consideration:', 'clinicalSafetyConsideration'],
];

const STAGE_PATTERNS = [
    [/recognize\s+cues|recognize/i, 'Recognize Cues'],
    [/analyze\s+cues|analyze/i, 'Analyze Cues'],
    [/prioritize/i, 'Prioritize Hypotheses'],
    [/generate\s+solutions/i, 'Generate Solutions'],
    [/take\s+action/i, 'Take Action'],
    [/evaluate\s+outcomes/i, 'Evaluate Outcomes'],
];

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const matchField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        if (line.startsWith(label)) return { key, value: clean(line.slice(label.length)) };
    }
    return null;
};

const normalizeDifficulty = (raw) => {
    const d = clean(raw);
    if (/NGN/i.test(d)) return 'Advanced Clinical Judgment';
    if (/^advanced/i.test(d)) return 'Advanced';
    if (/^hard/i.test(d)) return 'Hard';
    return 'Advanced';
};

const splitSentences = (text) => {
    const sentences = [];
    let start = 0;
    const re = /[.!?]['"]?(?=\s+[A-Za-z]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const end = m.index + m[0].length;
        sentences.push(text.slice(start, end).trim());
        start = end;
        re.lastIndex = end;
    }
    if (start < text.length) sentences.push(text.slice(start).trim());
    return sentences.filter(Boolean);
};

const sentenceEndAfter = (text, start) => {
    const re = /[.!?]['"]?(?=\s+[A-Za-z]|\s*$)/g;
    re.lastIndex = start;
    const m = re.exec(text);
    return m ? m.index + m[0].length : text.length;
};

const DIFF_RANK = { Hard: 1, Advanced: 2, 'Advanced Clinical Judgment': 3 };
const caseDifficulty = (list) => {
    const counts = {};
    list.forEach((x) => { counts[x.difficulty] = (counts[x.difficulty] || 0) + 1; });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || DIFF_RANK[b[0]] - DIFF_RANK[a[0]])[0][0];
};

const isVerbatimField = (narrative, value) => {
    if (narrative.includes(value)) return true;
    const parts = splitSentences(value);
    return parts.length > 0 && parts.every((p) => narrative.includes(p));
};

const lcp = (arr) => {
    if (!arr.length) return '';
    let prefix = arr[0];
    for (const s of arr.slice(1)) {
        let i = 0;
        while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
        prefix = prefix.slice(0, i);
        if (!prefix) break;
    }
    return prefix;
};

const narrativePrefixOf = (stems) => {
    const common = lcp(stems);
    // Keep shared question wording (e.g. "Which ") out of the narrative by
    // cutting the common prefix back to its last sentence boundary.
    const re = /[.!?]['"]?(?=\s|$)/g;
    let cut = 0;
    let m;
    while ((m = re.exec(common)) !== null) cut = m.index + m[0].length;
    return cut > 0 ? common.slice(0, cut) : common;
};

const buildPatientChart = (narrative) => {
    const chart = {};

    const ageMatch = narrative.match(/\b(\d{1,3})[- ]year-old\b/i);
    if (ageMatch) chart.age = Number(ageMatch[1]);

    const genderMatch = narrative.match(/\b\d{1,3}[- ]year-old\b[^.]{0,40}?\b(man|woman|boy|girl|male|female)\b/i);
    if (genderMatch) {
        chart.gender = ['man', 'boy', 'male'].includes(genderMatch[1].toLowerCase()) ? 'Male' : 'Female';
    }

    const sentences = splitSentences(narrative);
    if (sentences.length) chart.chiefComplaint = sentences[0];

    const homeMedPatterns = [
        /Home meds:\s*/i,
        /Home medications are\s*/i,
        /(?:Her|His) medications (?:are|include)\s*/i,
        /(?:lists|reports) (?:his|her) medications:\s*/i,
        /discharge medications are\s*/i,
        /(?:takes|uses|has taken)\s+/i,
    ];
    for (const re of homeMedPatterns) {
        const m = re.exec(narrative);
        if (!m) continue;
        const value = clean(narrative.slice(m.index + m[0].length, sentenceEndAfter(narrative, m.index + m[0].length)));
        if (/\d+\s*(?:mg|mcg|units?|g)\b/i.test(value) || /insulin/i.test(value)) {
            chart.homeMeds = value;
        }
        break;
    }

    const chartSentences = sentences;
    const vitalSentences = chartSentences.filter((s) =>
        /\b(BP|HR|RR|SpO2|T|Temp|temperature|fever)\b[^.\d]{0,30}\d|\b\d{2,3}\/\d{2,3}\s*mmHg\b/.test(s),
    );
    if (vitalSentences.length) chart.vitals = vitalSentences.join(' ');

    const labSentences = chartSentences.filter((s) =>
        /\b(glucose|A1C|HbA1c|creatinine|potassium|sodium|eGFR|bicarbonate|pH|anion gap|beta-hydroxybutyrate|lipase|platelets|AST|ALT|WBC|ESR|hemoglobin|osmolality|BUN|UACR|albumin|troponin|HDL|LDL|triglycerides|phosphorus|magnesium)\b[^.\d]{0,30}\d|\d+(?:,\d{3})*\s*(?:mg\/dL|mmol\/L|mEq\/L|mOsm\/kg|units?\/L|ng\/mL|g\/dL|\/mm3)\b/i.test(s),
    );
    if (labSentences.length) chart.labs = labSentences.join(' ');

    return chart;
};

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

    const items = [];
    for (let s = 0; s < starts.length; s++) {
        const seg = lines.slice(starts[s], starts[s + 1] ?? lines.length);
        const header = seg[0].match(ITEM_HEADER);
        const itemId = `PRX-HTD-${header[1]}`;

        // Reconstruct a header that may wrap across two or three lines. The
        // focus text and the "Advanced NGN Clinical Judgment" token can both
        // be split, e.g. "...: recognize" + "cues | Hard".
        let headerText = seg[0];
        let bodyStart = 1;
        while (bodyStart < Math.min(5, seg.length)) {
            const partsNow = headerText.split('|').map((p) => p.trim());
            const lastPart = partsNow[partsNow.length - 1];
            const next = seg[bodyStart];
            const candidate = `${lastPart} ${next}`.trim();
            const extendsDifficulty = KNOWN_DIFF.startsWith(candidate) && candidate.length <= KNOWN_DIFF.length;
            if (extendsDifficulty || partsNow.length < 3) {
                headerText = `${headerText} ${next}`.trim();
                bodyStart++;
            } else {
                break;
            }
        }

        const hdrParts = headerText.split('|').map((p) => p.trim());
        if (hdrParts.length < 3) throw new Error(`${itemId}: malformed header`);
        const focus = hdrParts[1];
        const difficultyRaw = hdrParts[hdrParts.length - 1];

        const answerIdx = seg.findIndex((line) => INSTRUCTION_LINE.test(line));
        if (answerIdx < 0) throw new Error(`${itemId}: missing teaching-package marker`);

        const firstOptionIdx = seg.findIndex((line) => OPTION_LINE.test(line));
        if (firstOptionIdx < 0 || firstOptionIdx > answerIdx) throw new Error(`${itemId}: no options found`);

        const stem = clean(seg.slice(bodyStart, firstOptionIdx).join(' '));

        const options = [];
        let currentOption = null;
        for (const line of seg.slice(firstOptionIdx, answerIdx)) {
            const om = line.match(OPTION_LINE);
            if (om) {
                currentOption = { letter: om[1], text: om[2].trim() };
                options.push(currentOption);
            } else if (currentOption) {
                currentOption.text = clean(`${currentOption.text} ${line}`);
            }
        }
        options.forEach((o) => { o.text = clean(o.text); });
        if (options.map((o) => o.letter).join('') !== 'ABCD') {
            throw new Error(`${itemId}: expected options A-D, got ${options.map((o) => o.letter).join('')}`);
        }

        const answerLine = seg.slice(answerIdx + 1).find((line) => ANSWER_LINE.test(line));
        if (!answerLine) throw new Error(`${itemId}: missing "Correct answer" line`);
        const correctLetter = answerLine.match(ANSWER_LINE)[1];
        const correctOption = options.find((o) => o.letter === correctLetter);
        if (!correctOption) throw new Error(`${itemId}: key ${correctLetter} not among options`);

        const whyCorrectIdx = seg.findIndex((line) => /^Why this is correct$/i.test(line));
        const whyWrongIdx = seg.findIndex((line) => /^Why each incorrect answer is wrong$/i.test(line));
        if (whyCorrectIdx < 0) throw new Error(`${itemId}: missing "Why this is correct"`);
        if (whyWrongIdx < 0) throw new Error(`${itemId}: missing "Why each incorrect answer is wrong"`);

        const rationaleText = clean(seg.slice(whyCorrectIdx + 1, whyWrongIdx).join(' '));

        const whyEntries = [];
        let activeWhy = null;
        for (let i = whyWrongIdx + 1; i < seg.length; i++) {
            const line = seg[i];
            if (matchField(line) || /^Authoritative references$/i.test(line) || /^Review status:/i.test(line)) break;
            const om = line.match(OPTION_LINE);
            if (om) {
                activeWhy = { letter: om[1], text: om[2].trim() };
                whyEntries.push(activeWhy);
            } else if (activeWhy) {
                activeWhy.text = clean(`${activeWhy.text} ${line}`);
            }
        }

        const fields = {};
        let activeField = null;
        for (let i = whyWrongIdx + 1; i < seg.length; i++) {
            const line = seg[i];
            if (/^Authoritative references$/i.test(line) || /^Review status:/i.test(line)) break;
            const fm = matchField(line);
            if (fm) {
                activeField = fm.key;
                fields[activeField] = fm.value;
            } else if (activeField) {
                fields[activeField] = clean(`${fields[activeField]} ${line}`);
            }
        }

        const refStart = seg.findIndex((line) => /^Authoritative references$/i.test(line));
        let references = '';
        if (refStart >= 0) {
            const refLines = [];
            for (let i = refStart + 1; i < seg.length; i++) {
                const line = seg[i];
                if (/^Review status:/i.test(line) || /^v\d+\.\d+:/i.test(line)) break;
                refLines.push(line.replace(/^[-•]\s*/, ''));
            }
            references = clean(refLines.join(' '));
        }

        const caseNo = Number(focus.match(/Case\s+(\d+)/i)?.[1]);
        const label = focus.replace(/^Case\s+\d+\s*-\s*/i, '');
        const cjmStage = STAGE_PATTERNS.find(([re]) => re.test(label))?.[1];

        items.push({
            itemId,
            caseNo,
            label,
            focus,
            difficulty: normalizeDifficulty(difficultyRaw),
            stem,
            options: options.map((o) => o.text),
            correctAnswer: correctOption.text,
            answerLineText: clean(answerLine.match(ANSWER_LINE)[2]),
            rationaleText,
            whyEntries: whyEntries.map((e) => ({ letter: e.letter, text: clean(e.text) })),
            fields,
            references,
            cjmStage,
        });
    }

    return items;
};

const buildCases = (items) => {
    const byCase = new Map();
    for (const item of items) {
        if (!byCase.has(item.caseNo)) byCase.set(item.caseNo, []);
        byCase.get(item.caseNo).push(item);
    }

    const cases = [];
    for (const [caseNo, list] of [...byCase.entries()].sort((a, b) => a[0] - b[0])) {
        list.sort((a, b) => a.itemId.localeCompare(b.itemId));
        const prefix = narrativePrefixOf(list.map((x) => x.stem));
        const narrative = clean(prefix.replace(/^Case\s+\d+\.\s*/i, ''));

        const q1 = list[0];
        let caseTitle = q1.focus.replace(/^Case\s+\d+\s*-\s*/i, '').split(':')[0].trim();
        if (/^(recognize|analyze|prioritize|generate|take action|evaluate)/i.test(caseTitle)) {
            caseTitle = `Case ${caseNo}`;
        }

        const questions = list.map((item, idx) => {
            if (!item.stem.startsWith(prefix)) {
                throw new Error(`${item.itemId}: stem does not start with the recovered case narrative`);
            }
            const questionText = clean(item.stem.slice(prefix.length));
            if (!questionText) throw new Error(`${item.itemId}: empty question text after narrative`);

            const rationale = [
                `Why this is correct: ${item.rationaleText}`,
                item.fields.clinicalPharmacologyBreakdown ? `Clinical pharmacology breakdown: ${item.fields.clinicalPharmacologyBreakdown}` : '',
                item.fields.clinicalSafetyConsideration ? `Clinical safety consideration: ${item.fields.clinicalSafetyConsideration}` : '',
            ].filter(Boolean).join(' ');

            const distractorExplanation = item.whyEntries.length
                ? `Why each incorrect answer is wrong: ${item.whyEntries.map((e) => `${e.letter}. ${e.text}`).join(' ')}`
                : '';

            const keyTakeaway = [
                item.fields.memoryTrick ? `Memory trick: ${item.fields.memoryTrick}` : '',
                item.fields.clinicalPearl ? `Clinical pearl: ${item.fields.clinicalPearl}` : '',
                item.fields.nclexTrap ? `NCLEX trap: ${item.fields.nclexTrap}` : '',
            ].filter(Boolean).join(' ');

            const strategyTip = [
                item.fields.preprxStrategy ? `PrepRX strategy: ${item.fields.preprxStrategy}` : '',
                item.fields.nclexConnection ? `NCLEX connection: ${item.fields.nclexConnection}` : '',
            ].filter(Boolean).join(' ');

            return {
                itemId: item.itemId,
                step: idx + 1,
                cjmStage: item.cjmStage || 'Recognize Cues',
                questionType: 'multiple_choice',
                questionText,
                options: item.options,
                correctAnswer: item.correctAnswer,
                rationale,
                distractorExplanation,
                keyTakeaway,
                strategyTip,
            };
        });

        cases.push({
            caseNo,
            title: `${NEW_TITLE_PREFIX}${caseNo}: ${caseTitle}`,
            difficulty: caseDifficulty(list),
            patientChart: buildPatientChart(narrative),
            scenarioNarrative: narrative,
            questions,
        });
    }
    return cases;
};

const validate = (cases, items) => {
    const errors = [];
    if (items.length !== 300) errors.push(`expected 300 source items, parsed ${items.length}`);
    if (cases.length !== 50) errors.push(`expected 50 cases, built ${cases.length}`);

    const seenIds = new Set();
    for (const item of items) {
        const n = item.itemId;
        if (seenIds.has(n)) errors.push(`${n}: duplicate item id`);
        seenIds.add(n);
        if (item.options.length !== 4) errors.push(`${n}: option count = ${item.options.length}`);
        if (new Set(item.options).size !== 4) errors.push(`${n}: duplicate option text`);
        if (!item.options.includes(item.correctAnswer)) errors.push(`${n}: correct answer not in options`);
        if (clean(item.answerLineText) !== clean(item.correctAnswer)) {
            errors.push(`${n}: answer-line text differs from option text`);
        }
        if (!item.rationaleText) errors.push(`${n}: empty rationale`);
        if (item.whyEntries.length !== 3) errors.push(`${n}: expected 3 distractor explanations, got ${item.whyEntries.length}`);
        const correctLetter = String.fromCharCode(65 + item.options.indexOf(item.correctAnswer));
        const expectedLetters = ['A', 'B', 'C', 'D'].filter((l) => l !== correctLetter);
        const gotLetters = item.whyEntries.map((e) => e.letter).sort();
        if (gotLetters.join('') !== expectedLetters.sort().join('')) {
            errors.push(`${n}: distractor letters ${gotLetters.join('')} do not match non-key options ${expectedLetters.join('')}`);
        }
        for (const key of ['memoryTrick', 'nclexTrap', 'clinicalPearl', 'clinicalPharmacologyBreakdown', 'nclexConnection', 'preprxStrategy', 'clinicalSafetyConsideration']) {
            if (!item.fields[key]) errors.push(`${n}: empty ${key}`);
        }
        if (!item.references) errors.push(`${n}: empty authoritative references`);
        if (!item.cjmStage) errors.push(`${n}: could not map a CJM stage from "${item.label}"`);
    }

    for (const c of cases) {
        if (c.questions.length !== 6) errors.push(`${c.title}: ${c.questions.length} questions`);
        if (!c.scenarioNarrative) errors.push(`${c.title}: empty narrative`);
        if (c.scenarioNarrative.length < 80) errors.push(`${c.title}: short narrative (${c.scenarioNarrative.length})`);
        if (/^Case\s+\d+\./i.test(c.scenarioNarrative)) errors.push(`${c.title}: narrative still starts with "Case N."`);
        for (const [field, value] of Object.entries(c.patientChart)) {
            if (field === 'gender') {
                if (!['Male', 'Female'].includes(value)) {
                    errors.push(`${c.title}: patientChart.gender is not Male/Female`);
                }
                continue;
            }
            if (typeof value === 'string' && value && !isVerbatimField(c.scenarioNarrative, value)) {
                errors.push(`${c.title}: patientChart.${field} is not a verbatim substring of the narrative`);
            }
        }
        if (!c.patientChart.age) errors.push(`${c.title}: missing age`);
        if (!c.patientChart.gender) errors.push(`${c.title}: missing gender`);
        for (const q of c.questions) {
            if (!q.questionText) errors.push(`${c.title} step ${q.step}: empty question text`);
            if (!q.options.includes(q.correctAnswer)) errors.push(`${c.title} step ${q.step}: correct answer not in options`);
            if (!q.rationale) errors.push(`${c.title} step ${q.step}: empty rationale`);
            if (!q.distractorExplanation) errors.push(`${c.title} step ${q.step}: empty distractorExplanation`);
            if (!q.keyTakeaway) errors.push(`${c.title} step ${q.step}: empty keyTakeaway`);
            if (!q.strategyTip) errors.push(`${c.title} step ${q.step}: empty strategyTip`);
        }
    }

    return errors;
};

const parsedItems = parseDoc();
const builtCases = buildCases(parsedItems);
const errors = validate(builtCases, parsedItems);

const diffDist = {};
builtCases.forEach((c) => { diffDist[c.difficulty] = (diffDist[c.difficulty] || 0) + 1; });
const stageDist = {};
parsedItems.forEach((i) => { stageDist[i.cjmStage] = (stageDist[i.cjmStage] || 0) + 1; });

console.log(`Parsed ${parsedItems.length} items -> ${builtCases.length} cases from ${FILE}`);
console.log('Case difficulty distribution:', diffDist);
console.log('CJM stage distribution:', stageDist);
console.log(`Validation errors: ${errors.length}`);
if (errors.length) {
    errors.slice(0, 40).forEach((e) => console.error('  - ' + e));
    process.exit(1);
}

if (DRY_RUN) {
    if (process.argv.includes('--dump')) {
        for (const c of builtCases) {
            const chart = c.patientChart;
            console.log(`${c.caseNo}\t${c.difficulty}\t${chart.age}/${chart.gender}\tmeds=${JSON.stringify((chart.homeMeds || '').slice(0, 60))}\tvitals=${JSON.stringify((chart.vitals || '').slice(0, 60))}\tlabs=${JSON.stringify((chart.labs || '').slice(0, 60))}`);
        }
        console.log('\nDRY-RUN: no database changes made.');
        process.exit(0);
    }
    const sampleCaseNo = Number(process.env.SAMPLE_CASE || 1);
    const c = builtCases.find((x) => x.caseNo === sampleCaseNo) || builtCases[0];
    console.log(`\nSample case: ${c.caseNo}`);
    console.log(' title:', c.title);
    console.log(' difficulty:', c.difficulty);
    console.log(' chart:', JSON.stringify(c.patientChart, null, 1));
    console.log(' narrative:', c.scenarioNarrative);
    console.log(' questions:');
    for (const q of c.questions) {
        console.log(`  ${q.step}. [${q.cjmStage}] ${q.questionText}`);
        console.log(`     options: ${JSON.stringify(q.options)}`);
        console.log(`     correct: ${q.correctAnswer}`);
        console.log(`     rationale: ${q.rationale}`);
        console.log(`     distractors: ${q.distractorExplanation}`);
        console.log(`     keyTakeaway: ${q.keyTakeaway}`);
        console.log(`     strategyTip: ${q.strategyTip}`);
    }
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(0);
}

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    const collection = mongoose.connection.db.collection('pirpractices');

    const old = await collection.findOne({ title: OLD_TITLE });
    const subTopic = old?.subTopic ?? FALLBACK_SUBTOPIC;
    console.log(`\nOld case found: ${old ? old._id : '(not found, using fallback subTopic)'}`);
    console.log('subTopic:', String(subTopic));

    const deleteFilter = {
        $or: [
            { title: OLD_TITLE },
            { title: new RegExp(`^${NEW_TITLE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) },
        ],
    };
    const before = await collection.countDocuments({});
    const del = await collection.deleteMany(deleteFilter);
    console.log(`Deleted: ${del.deletedCount} (was ${before} total)`);

    const docs = builtCases.map((c) => ({
        subTopic,
        title: c.title,
        category: 'priority-practice',
        difficulty: c.difficulty,
        patientChart: c.patientChart,
        scenarioNarrative: c.scenarioNarrative,
        questions: c.questions.map(({ itemId, ...q }) => q),
    }));

    const inserted = await PirPractice.insertMany(docs);
    console.log(`Inserted: ${inserted.length} cases`);

    const after = await collection.countDocuments({});
    console.log(`Priority-practice cases now: ${await collection.countDocuments({ category: 'priority-practice' })}`);
    console.log(`Total pirpractices: ${after}`);
    console.log(`New cases: ${await collection.countDocuments({ title: new RegExp(`^${NEW_TITLE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })}`);

    const missing = await collection.find({ title: new RegExp(`^${NEW_TITLE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
        .project({ title: 1, 'questions.step': 1 })
        .toArray();
    const badCounts = missing.filter((d) => d.questions.length !== 6);
    console.log(`New cases without exactly 6 questions: ${badCounts.length}`);

    await mongoose.disconnect();
    console.log('Done.');
};

run().catch((e) => { console.error(e); process.exit(1); });
