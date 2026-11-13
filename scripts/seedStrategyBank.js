import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import StrategyQuestionModel from '../Models/StrategyQuestion.js';

dotenv.config();

// Parameterized so one script seeds any fixed bank (ABC, Maslow, ADPIE, etc.).
// Override via env vars; defaults reproduce the ABC seed for parity.
const REQUIREMENTS_PATH = path.resolve(
    process.env.BANK_FILE || 'D:\\my projects\\secureroom\\newapp\\requirements.txt'
);
const STRATEGY_TAB = process.env.STRATEGY_TAB || 'Priority Framework';
const SUB_CATEGORY = process.env.SUB_CATEGORY || 'ABC(Airway, Breathing, Circulation)';
const PRIMARY_FRAMEWORK = process.env.PRIMARY_FRAMEWORK || 'ABC';
const SECONDARY_FRAMEWORK = process.env.SECONDARY_FRAMEWORK || '';
const LEADING_HEADER_LINES = parseInt(process.env.LEADING_HEADER_LINES || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');

const FIELD_LABELS = [
    'Correct Answer:',
    'Correct Selections:',
    'Rationale:',
    'Detailed Rationale:',
    'Why Each Incorrect Answer Is Wrong:',
    'Option-by-Option Rationale:',
    'Memory Trick:',
    'NCLEX Trap:',
    'Clinical Pearl:',
    'Clinical Pharmacology Breakdown:',
    'NCLEX Connection:',
    'PrepRX Test-Taking Strategy:',
    'PrepRX Elimination Strategy:',
    'PrepRX SATA Strategy:',
    'PrepRX Critical Thinking Strategy:',
    'PrepRX Priority Patient Strategy:',
    'PrepRX Pharm Shortcut:',
    'Authoritative Reference Validation:',
    'Number Correct:',
    'Difficulty:'
];

const isFieldLabel = (line) =>
    FIELD_LABELS.some((l) => line.trim().startsWith(l));

const isOptionLine = (line) => /^[A-F]\.\s/.test(line);

const VALID_DIFFICULTIES = [
    'Beginner', 'Intermediate', 'Advanced', 'NGN Case Study', 'Expert',
    'Moderate', 'Hard', 'Moderate-Hard', 'Advanced Clinical Judgment'
];

const normalizeDifficulty = (raw) => {
    let d = (raw || 'Intermediate').trim();
    if (/NGN/i.test(d)) d = 'Advanced Clinical Judgment';
    if (!VALID_DIFFICULTIES.includes(d)) d = 'Intermediate';
    return d;
};

// Drop everything after the final teaching field value (removes trailing
// developer/remediation/scoring specs that some banks append after the last question).
const truncateAtLastTeaching = (lines) => {
    let last = -1;
    for (let t = 0; t < lines.length; t++) if (isFieldLabel(lines[t])) last = t;
    if (last < 0) return lines;
    let end = last;
    for (let t = last + 1; t < lines.length; t++) {
        const tr = lines[t].trim();
        if (!tr) break;
        if (isFieldLabel(lines[t])) break;
        if (/^[A-Z][A-Z0-9 /&\-]{4,}$/.test(tr)) break; // all-caps section header
        if (/^(REMEDIATION|SCORING|REFERENCE|MASTER|END OF PROMPT|QUIZ ENGINE|DEVELOPER|IMPLEMENTATION)/i.test(tr)) break;
        if (/^Authoritative Reference Framework\b/i.test(tr)) break; // trailing reference list, not question content
        if (/Developer Prompt\s*$/i.test(tr)) break; // trailing quiz-engine spec, not question content
        if (/Quiz Engine/i.test(tr)) break; // trailing quiz-engine spec, not question content
        if (/Answer \/ Teaching Package/i.test(tr)) break; // stray marker between questions
        end = t;
    }
    return lines.slice(0, end + 1);
};

// Drop developer notes that some banks paste INSIDE a question's teaching block
// (e.g. "Implementation note: ..." between Rationale and the next field). The
// note and its wrapped continuation lines are removed; parsing resumes at the
// next real field label / option / page break.
const dropInsertedNotes = (lines) => {
    const NOTE_START = /^(No visible source question numbers|Implementation note:)/i;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (!NOTE_START.test(lines[i].trim())) { out.push(lines[i]); continue; }
        let j = i + 1;
        while (j < lines.length) {
            const t = lines[j].trim();
            if (!t) break;
            if (isFieldLabel(lines[j]) || isOptionLine(lines[j])) break;
            if (/Answer \/ Teaching Package/i.test(t)) break; // marker ends the note
            if (/question bank page/i.test(t) || /^preprx\b.*\bpage\s+\d+/i.test(t)) break;
            j++;
        }
        i = j - 1;
    }
    return out;
};

// Walk upward from an option block to find the first line of its stem.
// Stops at the previous teaching field label, then skips that field's
// lowercase value-continuation lines (they belong to the previous question,
// not the current stem). A real stem starts with an uppercase sentence.
const findStemStart = (lines, optionStartIdx) => {
    let idx = optionStartIdx - 1;
    while (idx >= 0 && !isFieldLabel(lines[idx])) idx--;
    let s = idx + 1;
    while (s < optionStartIdx && s < lines.length) {
        const tr = lines[s].trim();
        if (!tr) break;
        if (isFieldLabel(lines[s])) break;
        if (/^[a-z]/.test(tr)) { s++; continue; } // continuation of previous field's value
        break; // first line of the actual stem
    }
    return s;
};

const parseQuestions = (raw) => {
    let lines = raw.split(/\r?\n/);

    // Drop a leading header block (some banks preface the first question with metadata).
    if (LEADING_HEADER_LINES > 0) lines = lines.slice(LEADING_HEADER_LINES);

    // Drop page-break / running-header lines and per-question "Topic:" / "Critical Thinking Focus:" / "Priority Focus:" / "Pharm Focus:" markers.
    lines = lines.filter((l) => !/question bank page/i.test(l) && !/^preprx\b.*\bpage\s+\d+/i.test(l) && !/^topic:/i.test(l) && !/^critical thinking focus:/i.test(l) && !/^priority focus:/i.test(l) && !/^pharm focus:/i.test(l));

    // Drop developer notes pasted into the middle of a teaching block.
    // Runs BEFORE the marker strip so a note that sits directly above an
    // "Answer / Teaching Package" marker stops there instead of swallowing
    // the next question's stem.
    lines = dropInsertedNotes(lines);

    // Drop stray "Answer / Teaching Package" markers. Some banks place the
    // marker immediately before the next stem after a page break, which would
    // otherwise be captured as part of that stem.
    lines = lines.filter((l) => !/Answer \/ Teaching Package/i.test(l));

    // Drop any trailing developer spec after the last question.
    lines = truncateAtLastTeaching(lines);

    // Locate all option blocks (A/B/C/D, tolerant of wrapped option text).
    const optionBlocks = [];
    let i = 0;
    const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
    while (i < lines.length) {
        if (isOptionLine(lines[i])) {
            const start = i;
            const opts = [];
            let letterIdx = 0;
            let j = i;
            while (j < lines.length && letterIdx < LETTERS.length) {
                const m = lines[j].match(/^([A-F])\.\s+(.*)$/);
                if (!m || m[1] !== LETTERS[letterIdx]) break;
                let text = m[2].trim();
                j++;
                while (j < lines.length) {
                    const ln = lines[j];
                    if (!ln.trim()) break;
                    if (isOptionLine(ln)) break;
                    if (ln.includes('Answer / Teaching Package')) break;
                    if (isFieldLabel(ln)) break;
                    text += ' ' + ln.trim();
                    j++;
                }
                opts.push({ letter: m[1], text });
                letterIdx++;
            }
            if (opts.length >= 3) {
                optionBlocks.push({ start, end: j - 1, opts });
            }
            i = Math.max(j, i + 1);
            continue;
        }
        i++;
    }

    const questions = [];

    for (let k = 0; k < optionBlocks.length; k++) {
        const block = optionBlocks[k];
        const nextBlock = optionBlocks[k + 1];

        const stemStart = findStemStart(lines, block.start);
        const stemLines = lines.slice(stemStart, block.start).filter((l) => l.trim());
        const stem = stemLines.join(' ').trim();

        // The per-question "Difficulty:" header sits immediately above the stem in
        // these banks. Capture it for THIS question (the generic teach-block scan
        // would otherwise pick up the NEXT question's difficulty).
        let ownDifficulty = '';
        for (let t = stemStart - 1; t >= 0; t--) {
            const tr = lines[t].trim();
            if (!tr) continue;
            if (/^Difficulty:/.test(tr)) ownDifficulty = tr.slice('Difficulty:'.length).trim();
            break;
        }

        // Teaching = from after options up to the next question's stem start (or EOF,
        // which truncateAtLastTeaching has already trimmed to the last field value).
        const teachStart = block.end + 1;
        const nextStemStart = nextBlock ? findStemStart(lines, nextBlock.start) : lines.length;
        let teachEnd = nextStemStart;
        // Exclude the next question's own "Difficulty:" header from this package.
        for (let t = nextStemStart - 1; t >= teachStart; t--) {
            const tr = lines[t].trim();
            if (!tr) continue;
            if (/^Difficulty:/.test(tr)) teachEnd = t;
            break;
        }
        let teachLines = lines.slice(teachStart, teachEnd);
        teachLines = teachLines.filter((l) => !l.includes('Answer / Teaching Package'));

        const fields = {};
        let current = null;
        for (const line of teachLines) {
            const trimmed = line.trim();
            if (!trimmed) { current = null; continue; } // blank line ends a field's continuation
            const matchedLabel = FIELD_LABELS.find((l) => trimmed.startsWith(l));
            if (matchedLabel) {
                const value = trimmed.slice(matchedLabel.length).trim();
                if (matchedLabel === 'Why Each Incorrect Answer Is Wrong:') {
                    current = 'whyIncorrect';
                    fields[current] = value ? [value] : [];
                } else if (matchedLabel === 'Option-by-Option Rationale:') {
                    current = 'whyIncorrect';
                    fields[current] = value ? [value] : [];
                } else if (matchedLabel === 'Correct Answer:' || matchedLabel === 'Correct Selections:') {
                    current = 'correctAnswerLine';
                    fields[current] = value;
                } else if (matchedLabel === 'Detailed Rationale:') {
                    current = 'Rationale:';
                    fields[current] = value;
                } else if (matchedLabel === 'PrepRX Elimination Strategy:' || matchedLabel === 'PrepRX SATA Strategy:' || matchedLabel === 'PrepRX Critical Thinking Strategy:' || matchedLabel === 'PrepRX Priority Patient Strategy:' || matchedLabel === 'PrepRX Pharm Shortcut:') {
                    current = 'PrepRX Test-Taking Strategy:';
                    fields[current] = value;
                } else {
                    current = matchedLabel;
                    fields[current] = value;
                }
            } else if (current) {
                if (Array.isArray(fields[current])) fields[current].push(trimmed);
                else fields[current] = (fields[current] ? fields[current] + ' ' : '') + trimmed;
            }
        }

        const options = block.opts.map((o) => o.text);

        // Correct answer(s): supports single ("B", "B. text") or SATA multi
        // ("Correct Selections: A, B, C, D"). Only the LEADING key letters count —
        // scanning the whole line wrongly picks letters out of the option text
        // (e.g. "A. Assess..." => A plus the key letter).
        const ca = (fields.correctAnswerLine || '').trim();
        const keyMatch = ca.match(/^([A-F](?:\s*[,/&]\s*[A-F])*)/);
        const caLetters = keyMatch
            ? [...new Set(keyMatch[1].match(/[A-F]/g) || [])]
            : [];
        const correctTexts = [];
        for (const letter of caLetters) {
            const opt = block.opts.find((o) => o.letter === letter);
            if (opt) correctTexts.push(opt.text);
        }
        if (correctTexts.length === 0 && ca) {
            correctTexts.push(ca.replace(/^[A-F]\.\s*/, '').trim());
        }

        const whyIncorrect = Array.isArray(fields.whyIncorrect)
            ? fields.whyIncorrect.join(' ')
            : (fields.whyIncorrect || '');

        questions.push({
            strategyTab: STRATEGY_TAB,
            subCategory: SUB_CATEGORY,
            question: stem,
            options,
            correctAnswers: correctTexts,
            difficultyLevel: normalizeDifficulty(ownDifficulty || fields['Difficulty:']),
            rationale: fields['Rationale:'] || '',
            whyIncorrect,
            memoryTrick: fields['Memory Trick:'] || '',
            nclexTrap: fields['NCLEX Trap:'] || '',
            clinicalPearl: fields['Clinical Pearl:'] || '',
            clinicalPharmacologyBreakdown: fields['Clinical Pharmacology Breakdown:'] || '',
            nclexConnection: fields['NCLEX Connection:'] || '',
            preprxTestTakingStrategy: fields['PrepRX Test-Taking Strategy:'] || '',
            authoritativeReferenceValidation: fields['Authoritative Reference Validation:'] || '',
            primaryFramework: PRIMARY_FRAMEWORK,
            secondaryFramework: SECONDARY_FRAMEWORK
        });
    }

    return questions;
};

const validate = (qs) => {
    const errors = [];
    qs.forEach((q, idx) => {
        const n = idx + 1;
        if (q.options.length < 3 || q.options.length > 6) errors.push(`Q${n}: options count = ${q.options.length}`);
        if (q.correctAnswers.length < 1 || q.correctAnswers.length > q.options.length)
            errors.push(`Q${n}: correctAnswers length = ${q.correctAnswers.length}`);
        q.correctAnswers.forEach((ca) => {
            if (!q.options.includes(ca)) errors.push(`Q${n}: correct answer not in options -> "${ca}"`);
        });
        if (!q.question) errors.push(`Q${n}: empty question`);
        if (!q.rationale) errors.push(`Q${n}: empty rationale`);
        if (!q.whyIncorrect) errors.push(`Q${n}: empty whyIncorrect`);
        if (!VALID_DIFFICULTIES.includes(q.difficultyLevel))
            errors.push(`Q${n}: unknown difficulty -> "${q.difficultyLevel}"`);
    });
    return errors;
};

const main = async () => {
    const raw = fs.readFileSync(REQUIREMENTS_PATH, 'utf8');
    const questions = parseQuestions(raw);
    console.log(`Parsed ${questions.length} questions for subCategory="${SUB_CATEGORY}"`);

    const errors = validate(questions);
    if (errors.length) {
        console.error('VALIDATION ERRORS (first 25):');
        errors.slice(0, 25).forEach((e) => console.error(' - ' + e));
        process.exit(1);
    }

    if (DRY_RUN) {
        const dist = {};
        questions.forEach((q) => { dist[q.difficultyLevel] = (dist[q.difficultyLevel] || 0) + 1; });
        console.log('\nDifficulty distribution:', dist);
        console.log('\nFirst 3 question stems:');
        questions.slice(0, 3).forEach((q, i) => console.log(`  [${i + 1}] ${q.question}`));
        const sample = questions[0];
        console.log('\nSample question:');
        console.log('  Q:', sample.question);
        console.log('  Options:', sample.options);
        console.log('  Correct:', sample.correctAnswers);
        console.log('  difficultyLevel:', sample.difficultyLevel);
        console.log('  clinicalPearl:', sample.clinicalPearl.slice(0, 80));
        console.log('  authoritativeReferenceValidation:', sample.authoritativeReferenceValidation.slice(0, 80));
        const last = questions[questions.length - 1];
        console.log('\nLast question ARV (tail guard check):', last.authoritativeReferenceValidation.slice(0, 120));
        console.log('\nDRY-RUN: no database changes made.');
        return;
    }

    const mongodbUrl =
        process.env.MONGODB_URL ||
        (() => {
            const envRaw = fs.readFileSync('.env', 'utf8');
            for (const line of envRaw.split(/\r?\n/)) {
                const t = line.trim();
                if (t && !t.startsWith('#') && t.startsWith('MONGODB_URL=')) return t.slice('MONGODB_URL='.length).trim();
            }
            return null;
        })();

    if (!mongodbUrl) throw new Error('MONGODB_URL not found');

    await mongoose.connect(mongodbUrl);
    console.log('Connected to MongoDB');

    await StrategyQuestionModel.deleteMany({ strategyTab: STRATEGY_TAB, subCategory: SUB_CATEGORY });
    console.log(`Cleared existing "${SUB_CATEGORY}" docs`);

    const inserted = await StrategyQuestionModel.insertMany(questions);
    console.log(`Inserted ${inserted.length} questions`);

    const dist = {};
    inserted.forEach((d) => { dist[d.difficultyLevel] = (dist[d.difficultyLevel] || 0) + 1; });
    console.log('Difficulty distribution:', dist);

    // Show the first 3 stems to confirm they are clean (no header/trailing-spec leakage).
    console.log('\nFirst 3 question stems:');
    inserted.slice(0, 3).forEach((d, i) => {
        console.log(`  [${i + 1}] ${d.question}`);
    });
    const sample = inserted[0].toObject();
    console.log('\nSample question:');
    console.log('  Q:', sample.question);
    console.log('  Options:', sample.options);
    console.log('  Correct:', sample.correctAnswers);
    console.log('  difficultyLevel:', sample.difficultyLevel);
    console.log('  clinicalPearl:', sample.clinicalPearl.slice(0, 80));
    console.log('  authoritativeReferenceValidation:', sample.authoritativeReferenceValidation.slice(0, 80));

    await mongoose.disconnect();
    console.log('\nDone.');
};

main().catch((e) => { console.error(e); process.exit(1); });
