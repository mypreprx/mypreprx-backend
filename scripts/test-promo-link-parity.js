/**
 * Guards the promo link contract.
 *
 * The admin form builds links in the browser (VITE_CLIENT_URL) while the
 * backend builds the authoritative link (CLIENT_URL). If those two ever
 * disagree, an admin generates a QR code that scans to the wrong place and the
 * code stored in the database has a link nobody intended.
 *
 * Run:  node scripts/test-promo-link-parity.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const readEnv = (filePath) => {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
};

// Strip surrounding quotes the way dotenv does, then trailing slashes — exactly
// the normalization each side performs at runtime.
const normalize = (value) => String(value || '').replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');

let passed = 0;
let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

const backendEnv = readEnv(path.join(backendRoot, '.env'));
const frontendEnv = readEnv(path.join(backendRoot, '..', 'frontend', '.env'));

// Also honour a real environment (CI / production shell) over the file.
dotenv.config({ path: path.join(backendRoot, '.env') });

const backendBase = normalize(process.env.CLIENT_URL || backendEnv.CLIENT_URL);
const frontendBase = normalize(frontendEnv.VITE_CLIENT_URL);

console.log('\nPromo link contract\n');

check('backend CLIENT_URL is set', Boolean(backendBase), backendBase || '(missing)');
check('frontend VITE_CLIENT_URL is set', Boolean(frontendBase), frontendBase || '(missing)');
check(
  'backend and frontend agree on the base URL',
  backendBase === frontendBase,
  `backend=${backendBase} frontend=${frontendBase}`
);

// A production site should never generate localhost promo links.
check(
  'promo links are not localhost',
  !/^https?:\/\/localhost/i.test(backendBase),
  backendBase
);

const sample = 'ABCD2345';
check(
  'both sides generate an identical link',
  `${backendBase}/promo/${sample}` === `${frontendBase}/promo/${sample}`
);

console.log(`\n  backend  -> ${backendBase}/promo/${sample}`);
console.log(`  frontend -> ${frontendBase}/promo/${sample}`);
console.log(`\n${'='.repeat(52)}`);
console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
console.log('='.repeat(52));

process.exit(failed > 0 ? 1 : 0);