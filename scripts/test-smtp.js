// Verifies SMTP credentials against the real Gmail transport. Sends ONE email.
// Credentials come from env only - never written to disk.
//   $env:EMAIL_USERNAME='...'; $env:EMAIL_PASSWORD='...'; node scripts/test-smtp.js

import nodemailer from 'nodemailer';
import sendEmail from '../utilities/sendEmail.js';

const user = process.env.EMAIL_USERNAME;
const pass = process.env.EMAIL_PASSWORD;
if (!user || !pass) {
  console.error('EMAIL_USERNAME / EMAIL_PASSWORD not set in env');
  process.exit(2);
}
console.log(`sending as ${user}`);

console.log('\n--- A) verify SMTP auth only ---');
try {
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.verify();
  console.log('  PASS  gmail service + app password authenticates');
} catch (e) {
  console.log(`  FAIL  gmail service -> ${e.message.slice(0, 120)}`);
  console.log('  trying explicit smtp.gmail.com + authMethod PLAIN');
  try {
    const t = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      authMethod: 'PLAIN', auth: { user, pass },
    });
    await t.verify();
    console.log('  PASS  explicit host/port/authMethod PLAIN authenticates');
  } catch (e2) {
    console.log(`  FAIL  explicit -> ${e2.message.slice(0, 120)}`);
    process.exit(1);
  }
}

console.log('\n--- B) send one real email via sendEmail.js ---');
try {
  await sendEmail({
    email: user,
    subject: 'PrepRX - SMTP connectivity test',
    message: 'SMTP credentials are working. This is a connectivity check only.',
  });
  console.log('  PASS  email delivered through sendEmail.js');
} catch (e) {
  console.log(`  FAIL  sendEmail.js -> ${e.message.slice(0, 120)}`);
  process.exit(1);
}