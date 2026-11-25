/**
 * Seeds the Strategy Zone "SATA Boot Camp" bank from the v2.0 export
 * (sata.txt: 100 items, PRX-SAT-001 .. PRX-SAT-100).
 *
 * Layout differs from single-key banks (ABC / Elimination):
 *
 *   PRX-SAT-001 | <focus> | <difficulty>
 *   <stem, wrapped>
 *   A. ...  B. ...  C. ...  D. ...  [E. ...]  [F. ...]
 *   ANSWER / TEACHING PACKAGE - HIDDEN UNTIL LEARNER SUBMITS
 *   Correct answers (select all that apply): A. ...; D. ...; ...
 *   Why this is correct
 *   ...
 *   Why each correct option is correct
 *   A. ... / D. ...
 *   Why each incorrect answer is wrong
 *   B. ... / C. ...
 *   Memory Trick / NCLEX Trap / Clinical Pearl / Clinical Pharmacology /
 *   NCLEX Connection / PrepRX Strategy / Clinical Safety Consideration
 *   Authoritative references
 *   Review status / v2.0 trailer (dropped)
 *
 * Options are A–E or A–F. Only SATA Boot Camp docs are replaced.
 *
 *   node scripts/seedSataV2.js --dry-run
 *   node scripts/seedSataV2.js
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import StrategyQuestionModel from '../Models/StrategyQuestion.js';

dotenv.config();

const FILE = process.env.BANK_FILE || path.resolve('D:/my projects/secureroom/preprx/sata.txt');
const STRATEGY_TAB = 'SATA Boot Camp';
const SUB_CATEGORY = 'SATA Boot Camp';
const PRIMARY_FRAMEWORK = 'SATA Boot Camp';
const SECONDARY_FRAMEWORK = 'Select All That Apply';
const DRY_RUN = process.argv.includes('--dry-run');

const PAGE_HEADER = /^PrepRX Strategy Zone - .+ - v2\.0 - DRAFT pending clinical review Page \d+$/i;
const ITEM_HEADER = /^PRX-SAT-(\d{3})\s*\|(.*)$/;
const OPTION_LINE = /^([A-F])\.\s+(.*)$/;
const CORRECT_ANSWERS_LINE = /^Correct answers?\s*\(select all that apply\)\s*:/i;
const INSTRUCTION_LINE = /^ANSWER \/ TEACHING PACKAGE/i;
const DIFFICULTY_CONTINUE = /^(Judgment|Clinical Judgment)$/i;

const FIELD_LABELS = [
    ['Memory Trick:', 'memoryTrick'],
    ['NCLEX Trap:', 'nclexTrap'],
    ['Clinical Pearl:', 'clinicalPearl'],
    ['Clinical Pharmacology Breakdown:', 'clinicalPharmacologyBreakdown'],
    ['NCLEX Connection:', 'nclexConnection'],
    ['PrepRX Strategy:', 'preprxTestTakingStrategy'],
    ['Clinical Safety Consideration:', 'clinicalSafetyConsideration'],
];

const VALID_DIFFICULTIES = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'NGN Case Study',
    'Expert',
    'Moderate',
    'Hard',
    'Moderate-Hard',
    'Advanced Clinical Judgment',
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

const parseLetterBlock = (lines, stopFn) => {
    const entries = [];
    let active = null;
    for (const line of lines) {
        if (stopFn(line)) break;
        const om = line.match(OPTION_LINE);
        if (om) {
            active = { letter: om[1], text: om[2].trim() };
            entries.push(active);
        } else if (active) {
            active.text = `${active.text} ${line}`.trim();
        }
    }
    return entries;
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

    const questions = [];
    for (let s = 0; s < starts.length; s++) {
        const segment = lines.slice(starts[s], starts[s + 1] ?? lines.length);
        const header = segment[0].match(ITEM_HEADER);
        const itemId = `PRX-SAT-${header[1]}`;

        const headerParts = header[2].split('|').map((p) => p.trim());
        if (headerParts.length < 2) throw new Error(`${itemId}: malformed header`);
        const focus = headerParts[0];
        let difficultyRaw = headerParts[headerParts.length - 1];
        let bodyStart = 1;

        // Wrapped difficulty (PRX-SAT-001: "Advanced NGN Clinical" + "Judgment")
        if (DIFFICULTY_CONTINUE.test(segment[1] || '')) {
            difficultyRaw = `${difficultyRaw} ${segment[1]}`.trim();
            bodyStart = 2;
        }

        const answerIdx = segment.findIndex((line) => INSTRUCTION_LINE.test(line));
        if (answerIdx < 0) throw new Error(`${itemId}: missing teaching-package marker`);

        const firstOptionIdx = segment.findIndex((line) => OPTION_LINE.test(line));
        if (firstOptionIdx < 0 || firstOptionIdx > answerIdx) {
            throw new Error(`${itemId}: no options found`);
        }

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

        const optionLetters = options.map((o) => o.letter).join('');
        if (!/^ABCDE(F)?$/.test(optionLetters)) {
            throw new Error(`${itemId}: expected options A-E or A-F, got ${optionLetters}`);
        }

        // Correct-answer line(s) may wrap until "Why this is correct"
        const whyThisIdx = segment.findIndex((line) => /^Why this is correct$/i.test(line));
        const whyCorrectOptIdx = segment.findIndex((line) =>
            /^Why each correct option is correct$/i.test(line)
        );
        const whyWrongIdx = segment.findIndex((line) =>
            /^Why each incorrect answer is wrong$/i.test(line)
        );
        if (whyThisIdx < 0) throw new Error(`${itemId}: missing "Why this is correct"`);
        if (whyCorrectOptIdx < 0) throw new Error(`${itemId}: missing "Why each correct option is correct"`);
        if (whyWrongIdx < 0) throw new Error(`${itemId}: missing "Why each incorrect answer is wrong"`);

        const answerBlock = segment.slice(answerIdx + 1, whyThisIdx).join(' ');
        if (!CORRECT_ANSWERS_LINE.test(answerBlock)) {
            throw new Error(`${itemId}: missing "Correct answers (select all that apply)"`);
        }
        const correctLetters = [...answerBlock.matchAll(/\b([A-F])\.\s+/g)].map((m) => m[1]);
        const uniqueCorrect = [...new Set(correctLetters)];
        if (!uniqueCorrect.length) throw new Error(`${itemId}: no correct letters parsed`);

        const rationale = clean(segment.slice(whyThisIdx + 1, whyCorrectOptIdx).join(' '));

        const selectedEntries = parseLetterBlock(
            segment.slice(whyCorrectOptIdx + 1),
            (line) =>
                /^Why each incorrect answer is wrong$/i.test(line) ||
                Boolean(matchField(line)) ||
                /^Authoritative references$/i.test(line) ||
                /^Review status:/i.test(line)
        );

        const incorrectEntries = parseLetterBlock(
            segment.slice(whyWrongIdx + 1),
            (line) =>
                Boolean(matchField(line)) ||
                /^Authoritative references$/i.test(line) ||
                /^Review status:/i.test(line)
        );

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
                // Skip leftover option-letter explanation lines before first field
                if (OPTION_LINE.test(line) && !fields[activeField]) continue;
                fields[activeField] = `${fields[activeField]} ${line}`.trim();
            }
        }

        const refStart = segment.findIndex((line) => /^Authoritative references$/i.test(line));
        let references = '';
        if (refStart >= 0) {
            const refLines = [];
            for (let i = refStart + 1; i < segment.length; i++) {
                const line = segment[i];
                if (/^Review status:/i.test(line) || /^v\d+\.\d+:/i.test(line)) break;
                refLines.push(line.replace(/^[-•]\s*/, ''));
            }
            references = clean(refLines.join(' '));
        }

        options.forEach((o) => {
            o.text = clean(o.text);
        });

        for (const letter of uniqueCorrect) {
            if (!options.some((o) => o.letter === letter)) {
                throw new Error(`${itemId}: correct letter ${letter} not among options`);
            }
        }

        const correctAnswers = uniqueCorrect.map(
            (letter) => options.find((o) => o.letter === letter).text
        );

        let finalRationale = rationale;
        if (fields.clinicalSafetyConsideration) {
            finalRationale = `${finalRationale} Clinical safety consideration: ${clean(fields.clinicalSafetyConsideration)}`;
        }

        const selectedMap = Object.fromEntries(
            selectedEntries.map((e) => [e.letter, clean(e.text)])
        );
        const incorrectMap = Object.fromEntries(
            incorrectEntries.map((e) => [e.letter, clean(e.text)])
        );

        const whySelectedCorrect = uniqueCorrect
            .map((letter) => {
                const expl = selectedMap[letter] || '';
                return `${letter}: ${expl}`.trim();
            })
            .filter((row) => row.length > 2)
            .join(' ');

        const incorrectLetters = options
            .map((o) => o.letter)
            .filter((letter) => !uniqueCorrect.includes(letter));
        const whyIncorrect = incorrectLetters
            .map((letter) => {
                const expl = incorrectMap[letter] || '';
                return `${letter}: ${expl}`.trim();
            })
            .filter((row) => row.length > 2)
            .join(' ');

        const optionEvaluations = options.map((o) => ({
            optionText: o.text,
            isTrue: uniqueCorrect.includes(o.letter),
            explanation: selectedMap[o.letter] || incorrectMap[o.letter] || '',
        }));

        questions.push({
            itemId,
            focus,
            strategyTab: STRATEGY_TAB,
            subCategory: SUB_CATEGORY,
            question: clean(stem),
            options: options.map((o) => o.text),
            correctAnswers,
            difficultyLevel: normalizeDifficulty(difficultyRaw),
            rationale: clean(finalRationale),
            whyIncorrect,
            whySelectedCorrect,
            memoryTrick: clean(fields.memoryTrick),
            nclexTrap: clean(fields.nclexTrap),
            clinicalPearl: clean(fields.clinicalPearl),
            clinicalPharmacologyBreakdown: clean(fields.clinicalPharmacologyBreakdown),
            nclexConnection: clean(fields.nclexConnection),
            preprxTestTakingStrategy: clean(fields.preprxTestTakingStrategy),
            authoritativeReferenceValidation: references,
            primaryFramework: PRIMARY_FRAMEWORK,
            secondaryFramework: SECONDARY_FRAMEWORK,
            optionEvaluations,
        });
    }

    return questions;
};

const uiParseLetterRows = (raw) => {
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

const validate = (questions) => {
    const errors = [];
    const seen = new Set();
    questions.forEach((q, idx) => {
        const n = q.itemId || `Q${idx + 1}`;
        if (seen.has(q.itemId)) errors.push(`${n}: duplicate item id`);
        seen.add(q.itemId);
        if (!q.question) errors.push(`${n}: empty question`);
        if (q.options.length < 5 || q.options.length > 6) {
            errors.push(`${n}: option count = ${q.options.length}`);
        }
        if (new Set(q.options).size !== q.options.length) errors.push(`${n}: duplicate option text`);
        if (q.correctAnswers.length < 1) errors.push(`${n}: no correct answers`);
        q.correctAnswers.forEach((ca) => {
            if (!q.options.includes(ca)) errors.push(`${n}: correct answer not in options -> "${ca}"`);
        });
        if (!q.rationale) errors.push(`${n}: empty rationale`);
        if (!q.whySelectedCorrect) errors.push(`${n}: empty whySelectedCorrect`);

        const correctIdx = q.correctAnswers.map((ca) => q.options.indexOf(ca));
        const expectedCorrect = correctIdx.map((i) => String.fromCharCode(65 + i));
        const selectedRows = uiParseLetterRows(q.whySelectedCorrect);
        if (selectedRows.map((r) => r.letter).join('') !== expectedCorrect.join('')) {
            errors.push(
                `${n}: whySelectedCorrect letters [${selectedRows.map((r) => r.letter).join('')}] != [${expectedCorrect.join('')}]`
            );
        }

        const expectedIncorrect = q.options
            .map((_, i) => String.fromCharCode(65 + i))
            .filter((letter) => !expectedCorrect.includes(letter));
        // All-correct SATA items (e.g. PRX-SAT-046) have an empty incorrect block.
        if (expectedIncorrect.length === 0) {
            if (q.whyIncorrect) errors.push(`${n}: expected empty whyIncorrect when all options are correct`);
        } else {
            if (!q.whyIncorrect) errors.push(`${n}: empty whyIncorrect`);
            const wrongRows = uiParseLetterRows(q.whyIncorrect);
            if (wrongRows.map((r) => r.letter).join('') !== expectedIncorrect.join('')) {
                errors.push(
                    `${n}: whyIncorrect letters [${wrongRows.map((r) => r.letter).join('')}] != [${expectedIncorrect.join('')}]`
                );
            }
        }

        for (const key of [
            'memoryTrick',
            'nclexTrap',
            'clinicalPearl',
            'clinicalPharmacologyBreakdown',
            'nclexConnection',
            'preprxTestTakingStrategy',
        ]) {
            if (!q[key]) errors.push(`${n}: empty ${key}`);
        }
        if (!q.authoritativeReferenceValidation) errors.push(`${n}: empty authoritative references`);
        if (PAGE_HEADER.test(q.question) || /Review status:/i.test(JSON.stringify(q))) {
            errors.push(`${n}: page header / review status leaked into a field`);
        }
        if (!VALID_DIFFICULTIES.includes(q.difficultyLevel)) {
            errors.push(`${n}: bad difficulty "${q.difficultyLevel}"`);
        }
        if (q.optionEvaluations.length !== q.options.length) {
            errors.push(`${n}: optionEvaluations length mismatch`);
        }
    });
    return errors;
};

const parsed = parseDoc();
console.log(`Parsed ${parsed.length} questions from ${FILE}`);
const dist = {};
parsed.forEach((q) => {
    dist[q.difficultyLevel] = (dist[q.difficultyLevel] || 0) + 1;
});
console.log('Difficulty distribution:', dist);
const optDist = {};
parsed.forEach((q) => {
    optDist[q.options.length] = (optDist[q.options.length] || 0) + 1;
});
console.log('Option-count distribution:', optDist);
console.log(
    'First ids:',
    parsed.slice(0, 3).map((q) => q.itemId).join(', '),
    '| last:',
    parsed[parsed.length - 1]?.itemId
);

const errors = validate(parsed);
console.log(`Validation errors: ${errors.length}`);
if (errors.length) {
    errors.slice(0, 40).forEach((e) => console.error('  - ' + e));
    process.exit(1);
}

const sample = parsed[0];
console.log('\n--- SAMPLE: ' + sample.itemId + ' ---');
console.log('focus:', sample.focus);
console.log('difficulty:', sample.difficultyLevel);
console.log('question:', sample.question.slice(0, 220));
console.log('options:', sample.options.length, sample.options);
console.log('correctAnswers:', sample.correctAnswers);
console.log('rationale:', sample.rationale.slice(0, 200));
console.log('whySelectedCorrect:', sample.whySelectedCorrect.slice(0, 220));
console.log('whyIncorrect:', sample.whyIncorrect.slice(0, 220));
console.log('memoryTrick:', sample.memoryTrick.slice(0, 100));
console.log('strategy:', sample.preprxTestTakingStrategy.slice(0, 120));
console.log('references:', sample.authoritativeReferenceValidation.slice(0, 160));

const last = parsed[parsed.length - 1];
console.log('\n--- LAST: ' + last.itemId + ' ---');
console.log('question:', last.question.slice(0, 140));
console.log('correct count:', last.correctAnswers.length);
console.log('references tail:', last.authoritativeReferenceValidation.slice(-160));

if (DRY_RUN) {
    console.log('\nDRY-RUN: no database changes made.');
    process.exit(0);
}

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    const filter = { strategyTab: STRATEGY_TAB };

    const before = await StrategyQuestionModel.countDocuments(filter);
    console.log(`\nExisting "${STRATEGY_TAB}" docs: ${before}`);

    const del = await StrategyQuestionModel.deleteMany(filter);
    console.log(`Deleted: ${del.deletedCount}`);

    const docs = parsed.map(({ itemId, focus, ...doc }) => doc);
    const inserted = await StrategyQuestionModel.insertMany(docs);
    console.log(`Inserted: ${inserted.length}`);

    const after = await StrategyQuestionModel.countDocuments(filter);
    const otherTabs = await StrategyQuestionModel.countDocuments({
        strategyTab: { $ne: STRATEGY_TAB },
    });
    console.log(`SATA docs now: ${after} | docs in other strategy tabs untouched: ${otherTabs}`);

    const leak = await StrategyQuestionModel.countDocuments({
        ...filter,
        $or: [
            { question: /PrepRX Strategy Zone - SATA Boot Camp/i },
            { rationale: /Review status:/i },
            { whyIncorrect: /Review status:/i },
            { whySelectedCorrect: /Review status:/i },
            { clinicalPearl: /Review status:/i },
            { nclexTrap: /Review status:/i },
            { nclexConnection: /Review status:/i },
            { preprxTestTakingStrategy: /Review status:/i },
            { memoryTrick: /Review status:/i },
            { authoritativeReferenceValidation: /Review status:/i },
        ],
    });
    console.log('Docs with leaked page/review text:', leak);

    console.log('\nDB samples:');
    inserted.slice(0, 2).forEach((d, i) => {
        console.log(`  [${i + 1}] ${d.question.slice(0, 100)}...`);
        console.log(
            `      opts=${d.options.length} correct=${d.correctAnswers.length} diff=${d.difficultyLevel}`
        );
    });

    console.log('\nDone.');
    await mongoose.disconnect();
    process.exit(0);
};

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
