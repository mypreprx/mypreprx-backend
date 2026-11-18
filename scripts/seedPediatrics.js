import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import topicModel from '../Models/topicSchema.js';
import subtopicModel from '../Models/subTopicSchema.js';
import QuestionModel from '../Models/Question.js';

dotenv.config();

const FILE = process.env.SEED_FILE || 'D:\\my projects\\secureroom\\preprx\\padiatrics.txt';
const DRY_RUN = process.argv.includes('--dry-run');

// ----- label classifiers -----
// Layout of the current Pediatrics clinical-review export:
//   PrepRX / PEDIATRICS
//   CLINICAL REVIEW DRAFT n
//   PRX-PED-001 · <focus>            (focus may wrap onto more lines)
//   Advanced · <domain> · 6 words per choice
//   <stem, wrapped>
//   A. ...  B. ...  C. ...  D. ...
//   Correct answer C
//   Correct rationale ...
//   Why each other option is incorrect
//   A. ... / B. ... / D. ...         (only the incorrect options)
//   Memory trick ...
//   NCLEX trap ...
//   Clinical pearl ...
//   Clinical pharmacology ...
//   NCLEX connection ...
//   PrepRX test-taking strategy ...
//   Authoritative reference validation   <-- intentionally NOT seeded
//   ...reference lines...                 <-- intentionally NOT seeded
const reItem = /^PRX-PED-\d{3}\s*·\s*(.*)$/; // -> focus start (group 1)
const reMeta = /^(Advanced|Hard|Moderate-Hard|Moderate|Intermediate|Beginner)\s*·\s*(.+?)\s*·\s*\d+\s+words?\s+per\s+choice$/i;
const reOption = /^([A-D])\.\s+(.*)$/;
const reKey = /^Correct answer\s+([A-D])\s*$/i;
const rePageHeader = /^(PrepRX \/ PEDIATRICS|CLINICAL REVIEW DRAFT \d+)$/i;
const reWhyHeading = /^Why each other option is incorrect\s*$/i;
const reARV = /^Authoritative reference validation\s*$/i;

const FIELD_LABELS = [
    ['Correct rationale', 'rationale'],
    ['Memory trick', 'memoryTrick'],
    ['NCLEX trap', 'nclexTrap'],
    ['Clinical pearl', 'clinicalPearl'],
    ['Clinical pharmacology', 'clinicalPharmacologyBreakdown'],
    ['NCLEX connection', 'nclexConnection'],
    ['PrepRX test-taking strategy', 'pedrxStrategy']
];

const matchField = (line) => {
    for (const [label, key] of FIELD_LABELS) {
        // label is followed by a space (or is the whole line)
        if (line === label || line.startsWith(label + ' ')) {
            return { key, value: line.slice(label.length).trim() };
        }
    }
    return null;
};

// Map the export's author-judgment labels onto the taxonomy used by the rest of
// the Study Zone banks, so Pediatrics stays filterable alongside the others.
const DIFFICULTY_MAP = {
    'Advanced': 'Advanced / NGN-Level',
    'NGN Case Study': 'Advanced / NGN-Level',
    'Hard': 'Hard',
    'Moderate-Hard': 'Moderate-Hard',
    'Moderate': 'Moderate',
    'Intermediate': 'Intermediate',
    'Beginner': 'Beginner'
};

const parseDoc = () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\ufeff/, '').trim());

    const questions = [];
    let current = null;
    let mode = 'preamble';   // preamble | title | stem | options | teaching | why | skip
    let active = null;       // active field key (teaching) or option letter

    const final = () => {
        if (current) questions.push(current);
        current = null;
    };

    for (const line of lines) {
        if (!line) continue;
        if (rePageHeader.test(line)) continue;

        const im = line.match(reItem);
        if (im) {
            final();
            current = {
                focusParts: [im[1].trim()],
                difficulty: '',
                domain: '',
                wordCount: 0,
                stemLines: [],
                options: {},
                optionWraps: {},
                keyLetter: '',
                rationale: '',
                whyEntries: [],
                memoryTrick: '',
                nclexTrap: '',
                clinicalPearl: '',
                clinicalPharmacologyBreakdown: '',
                nclexConnection: '',
                pedrxStrategy: ''
            };
            mode = 'title';
            active = null;
            continue;
        }

        if (!current) continue;

        if (mode === 'title') {
            const mm = line.match(reMeta);
            if (mm) {
                current.difficulty = mm[1].trim();
                current.domain = mm[2].trim();
                current.wordCount = parseInt(line.match(/(\d+)\s+words?\s+per\s+choice/i)[1], 10);
                mode = 'stem';
                active = null;
            } else {
                current.focusParts.push(line.trim());
            }
            continue;
        }

        if (mode === 'stem') {
            const om = line.match(reOption);
            if (om && om[1] === 'A') {
                current.options.A = om[2].trim();
                mode = 'options';
                active = 'A';
            } else {
                current.stemLines.push(line);
            }
            continue;
        }

        if (mode === 'options') {
            const om = line.match(reOption);
            if (om) {
                current.options[om[1]] = om[2].trim();
                active = om[1];
                continue;
            }
            const km = line.match(reKey);
            if (km) {
                current.keyLetter = km[1];
                mode = 'teaching';
                active = null;
                continue;
            }
            // Wrapped option text.
            if (active) current.options[active] = (current.options[active] + ' ' + line).trim();
            continue;
        }

        // ---- teaching package ----
        if (reWhyHeading.test(line)) {
            mode = 'why';
            active = null;
            continue;
        }

        if (reARV.test(line)) {
            // User instruction: do NOT seed Authoritative Reference Validation.
            // Skip its content until the next question / page header.
            mode = 'skip';
            active = null;
            continue;
        }

        if (mode === 'skip') continue;

        const fm = matchField(line);
        if (fm) {
            mode = 'teaching';
            active = fm.key;
            current[fm.key] = fm.value;
            continue;
        }

        if (mode === 'why') {
            const wm = line.match(reOption);
            if (wm) {
                current.whyEntries.push({ letter: wm[1], text: wm[2].trim() });
                continue;
            }
            if (current.whyEntries.length) {
                const last = current.whyEntries[current.whyEntries.length - 1];
                last.text = (last.text + ' ' + line).trim();
            }
            continue;
        }

        if (mode === 'teaching' && active) {
            current[active] = (current[active] ? current[active] + ' ' : '') + line;
        }
    }

    final();
    return questions;
};

// ----- build a finished question document -----
const buildQuestionDoc = (q, subTopicId) => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const options = ['A', 'B', 'C', 'D'].map((l) => clean(q.options[l]));
    const correctAnswer = clean(q.options[q.keyLetter]);
    const whyIncorrect = q.whyEntries
        .map((e) => `${e.letter}: ${clean(e.text)}`)
        .join(' ');

    return {
        subTopic: subTopicId,
        question: clean(q.stemLines.join(' ')),
        option: options,
        correctAnswer,
        questionType: 'Single Choice',
        difficulty: DIFFICULTY_MAP[q.difficulty] || q.difficulty,
        rationale: clean(q.rationale),
        whyIncorrect,
        memoryTrick: clean(q.memoryTrick),
        nclexTrap: clean(q.nclexTrap),
        clinicalPearl: clean(q.clinicalPearl),
        // Authoritative Reference Validation is deliberately omitted.
        clinicalPharmacologyBreakdown: q.clinicalPharmacologyBreakdown
            ? { drugConcept: clean(q.clinicalPharmacologyBreakdown) }
            : undefined,
        nclexConnection: clean(q.nclexConnection),
        pedrxStrategy: clean(q.pedrxStrategy),
        optionEvaluations: []
    };
};

// ----- main -----
const parsed = parseDoc();

// group by domain (subtopic)
const domainOrder = [];
const byDomain = {};
for (const q of parsed) {
    if (!byDomain[q.domain]) {
        byDomain[q.domain] = [];
        domainOrder.push(q.domain);
    }
    byDomain[q.domain].push(q);
}

console.log(`Parsed ${parsed.length} questions`);
console.log('By domain:');
for (const d of domainOrder) console.log(`  ${d}: ${byDomain[d].length}`);

// validate parse
const errors = [];
parsed.forEach((q, idx) => {
    const n = idx + 1;
    const stem = q.stemLines.join(' ').trim();
    if (!stem) errors.push(`Q${n}: empty question text`);
    for (const l of ['A', 'B', 'C', 'D']) {
        if (!q.options[l] || !q.options[l].trim()) errors.push(`Q${n}: missing option ${l}`);
    }
    if (!['A', 'B', 'C', 'D'].includes(q.keyLetter)) errors.push(`Q${n}: no correct answer key`);
    if (!q.options[q.keyLetter]) errors.push(`Q${n}: key ${q.keyLetter} not among options`);
    if (!q.domain) errors.push(`Q${n}: no domain`);
    if (!q.difficulty) errors.push(`Q${n}: no difficulty`);
    if (!DIFFICULTY_MAP[q.difficulty]) errors.push(`Q${n}: unknown difficulty "${q.difficulty}"`);
    if (!q.rationale) errors.push(`Q${n}: empty rationale`);
    if (!q.whyEntries.length) errors.push(`Q${n}: empty whyIncorrect`);
    if (!q.memoryTrick) errors.push(`Q${n}: empty memoryTrick`);
    if (!q.nclexTrap) errors.push(`Q${n}: empty nclexTrap`);
    if (!q.clinicalPearl) errors.push(`Q${n}: empty clinicalPearl`);
    if (!q.nclexConnection) errors.push(`Q${n}: empty nclexConnection`);
    if (!q.pedrxStrategy) errors.push(`Q${n}: empty pedrxStrategy`);
    const blob = JSON.stringify({
        stem, options: q.options, rationale: q.rationale, why: q.whyEntries,
        memory: q.memoryTrick, trap: q.nclexTrap, pearl: q.clinicalPearl,
        pharm: q.clinicalPharmacologyBreakdown, conn: q.nclexConnection, strat: q.pedrxStrategy
    }).toLowerCase();
    if (blob.includes('authoritative reference validation') || blob.includes('pediatric clinical sign-off pending')) {
        errors.push(`Q${n}: ARV leaked into seeded fields`);
    }
});
console.log(`Validation errors: ${errors.length}`);
if (errors.length) errors.slice(0, 40).forEach((e) => console.error('  - ' + e));

// sample
if (parsed[0]) {
    const s = parsed[0];
    const doc = buildQuestionDoc(s, 'fake-id');
    console.log('\n--- SAMPLE Q1 ---');
    console.log('focus:', s.focusParts.join(' '), '| domain:', s.domain, '| file difficulty:', s.difficulty);
    console.log('question:', doc.question.slice(0, 160));
    console.log('options:', doc.option);
    console.log('correctAnswer:', doc.correctAnswer);
    console.log('difficulty stored:', doc.difficulty);
    console.log('rationale:', String(doc.rationale).slice(0, 120));
    console.log('whyIncorrect:', String(doc.whyIncorrect).slice(0, 140));
    console.log('memoryTrick:', String(doc.memoryTrick).slice(0, 90));
    console.log('nclexTrap:', String(doc.nclexTrap).slice(0, 90));
    console.log('clinicalPearl:', String(doc.clinicalPearl).slice(0, 90));
    console.log('pharm.drugConcept:', String(doc.clinicalPharmacologyBreakdown?.drugConcept).slice(0, 90));
    console.log('nclexConnection:', String(doc.nclexConnection).slice(0, 90));
    console.log('pedrxStrategy:', String(doc.pedrxStrategy).slice(0, 90));
    console.log('has ARV field:', 'authoritativeReferenceValidation' in doc);
}

if (DRY_RUN || errors.length) {
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(errors.length ? 1 : 0);
}

// ----- replace & seed -----
const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);

    const topic = await topicModel.findOne({ title: { $regex: /^Pediatrics$/i } });
    if (!topic) throw new Error('Pediatrics topic not found');

    // 1) delete existing subtopics + their questions
    const existingSubs = await subtopicModel.find({ topicId: topic._id }).lean();
    const existingIds = existingSubs.map((s) => s._id);
    const delQuestions = await QuestionModel.deleteMany({ subTopic: { $in: existingIds } });
    const delSubs = await subtopicModel.deleteMany({ topicId: topic._id });
    console.log(`Deleted ${delSubs.deletedCount} old subtopics and ${delQuestions.deletedCount} old questions`);

    // 2) create new subtopics (one per domain) with content built from its focus list
    const newSubs = [];
    for (const domain of domainOrder) {
        const foci = [...new Set(byDomain[domain].map((q) => q.focusParts.join(' ')))];
        const content = `${domain} - ${foci.join('; ')}. Lesson questions: ${byDomain[domain].length}.`;
        const sub = new subtopicModel({ topicId: topic._id, title: domain, content });
        const saved = await sub.save();
        newSubs.push({ sub: saved, domain });
    }

    // 3) insert questions per subtopic
    let inserted = 0;
    for (const { sub, domain } of newSubs) {
        const docs = byDomain[domain].map((q) => buildQuestionDoc(q, sub._id));
        const res = await QuestionModel.insertMany(docs);
        inserted += res.length;
    }

    console.log(`Inserted ${inserted} new questions across ${newSubs.length} subtopics`);

    // 4) post-insert sanity
    for (const { sub, domain } of newSubs) {
        const c = await QuestionModel.countDocuments({ subTopic: sub._id });
        console.log(`  [${sub.title}] cases/questions: ${c} | id=${sub._id}`);
    }
    const arvLeak = await QuestionModel.countDocuments({
        subTopic: { $in: newSubs.map((x) => x.sub._id) },
        $or: [
            { rationale: /Authoritative reference validation/i },
            { clinicalPearl: /Authoritative reference validation/i },
            { nclexTrap: /Authoritative reference validation/i },
            { nclexConnection: /Authoritative reference validation/i },
            { pedrxStrategy: /Authoritative reference validation/i },
            { memoryTrick: /Authoritative reference validation/i },
            { whyIncorrect: /Authoritative reference validation/i }
        ]
    });
    console.log('Docs with ARV leaked into seeded fields:', arvLeak);

    console.log('\nDone.');
    process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
