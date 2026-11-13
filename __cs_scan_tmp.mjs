import fs from 'fs';

const FILE = 'D:\\my projects\\secureroom\\preprx\\Case Studies.txt';
const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).map(l => l.replace(/^﻿/, '').trim());
const reCase = /^(?:Case Study|Clinical Scenario) (\d+):\s*(.+?)\s*$/;
const reQuestion = /^Question (\d+)(?:\s*-\s*(.+?))?(?:\s*\(.*\))?\s*$/;
const reOption = /^([A-F])\.\s+(.*)$/;
const reFormat = /^Current (?:NGN )?format:/i;
const reCorrect = /^Correct Answer:/i;

let inTeaching = false;
let curCase = 0, curQ = 0, qCount = 0;
const flags = [];
const caseNos = new Set();
let formats = 0, corrects = 0, optionCount = 0, qHeaders = 0;
let firstContentAfterCase = true;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l) continue;
  const cm = l.match(reCase);
  if (cm) { curCase = +cm[1]; caseNos.add(curCase); inTeaching = false; firstContentAfterCase = true; continue; }
  const qm = l.match(reQuestion);
  if (qm) { qHeaders++; inTeaching = false; continue; }
  if (reFormat.test(l)) {
    formats++; qCount++; inTeaching = false; firstContentAfterCase = false;
    continue;
  }
  if (reCorrect.test(l)) { corrects++; inTeaching = true; continue; }
  if (inTeaching && reOption.test(l)) flags.push({ line: i + 1, case: curCase, text: l.slice(0, 100) });
  if (!inTeaching && reOption.test(l)) optionCount++;
}

console.log(`Cases: ${caseNos.size} (numbers ${Math.min(...caseNos)}..${Math.max(...caseNos)})`);
console.log(`Question headers: ${qHeaders}`);
console.log(`Current format starts: ${formats}`);
console.log(`Correct Answer lines: ${corrects}`);
console.log(`Option lines counted: ${optionCount}`);
console.log(`Option-like lines inside teaching (would be misread): ${flags.length}`);
flags.slice(0, 20).forEach(f => console.log(`  L${f.line} case ${f.case}: ${f.text}`));
