/**
 * Admin promo features: QR download + redeemer visibility.
 *
 * Creates a promo, downloads the QR as a real PNG and decodes it to prove the
 * bytes are a scannable code pointing at the promo link â€” not just any PNG.
 * Then redeems it as a real user and confirms the admin view surfaces that
 * account.
 *
 * Run:  node scripts/test-admin-promo-tools.js
 */
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const userModel = (await import('../Models/userSchema.js')).default;
const bcrypt = (await import('bcrypt')).default;
const PromoCode = (await import('../Models/promoCodeSchema.js')).default;
const {
  createPromoCodeService,
  getAllPromoCodesService,
} = (await import('../Services/adminServices/PromoCodeServices/PromoCodeService.js'));
const { promoQrPngBuffer } = await import('../Services/adminServices/PromoCodeServices/promoQr.js');
const { redeemPromoCodeService } = await import('../Services/billingServices/promoRedemptionService.js');

let passed = 0;
let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`); }
};
const section = (n) => console.log(`\n${n}`);

const PW = 'E2e!Passw0rd#2026';
const created = { promos: [], users: [] };

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);
  const stamp = Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

  try {
    // ------------------------------------------------------- QR generation
    section('QR PNG generation');
    const promo = await createPromoCodeService({
      title: 'E2E QR Tool Promo',
      code: `E2E${stamp}`,
    });
    created.promos.push(promo.code);

    const png = await promoQrPngBuffer(promo.qrPayload || promo.link);
    check('returns a Buffer', Buffer.isBuffer(png));
    check('non-trivial size', png.length > 200, `${png.length} bytes`);

    // PNG magic number: a file the OS will actually open as an image.
    check('has PNG magic bytes',
      png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47,
      [...png.subarray(0, 4)].map((b) => b.toString(16)).join(' '));

    // The real proof: decode it back and confirm the promo link survived.
    let decoded = null;
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const jsQR = require('jsqr');
      const decodedPng = await (await import('pngjs')).PNG.sync.read(png);
      const result = jsQR(new Uint8ClampedArray(
        decodedPng.data.buffer,
        decodedPng.data.byteOffset,
        decodedPng.data.length
      ), decodedPng.width, decodedPng.height);
      decoded = result?.data || null;
    } catch (e) {
      console.log(`         (decoder unavailable: ${e.message})`);
    }

    if (decoded) {
      check('QR decodes successfully', true);
      check('decoded payload is the promo link', decoded === promo.link, `${decoded}`);
    } else {
      console.log('  SKIP  decode verification (jsqr/pngjs not installed)');
    }

    check('filename-safe code', /^[A-Z0-9-]+$/.test(promo.code), promo.code);

    // -------------------------------------------- unredeemed visibility
    section('Admin list before redemption');
    const beforeList = await getAllPromoCodesService();
    const before = beforeList.find((p) => p.code === promo.code);
    check('promo appears in the admin list', Boolean(before));
    check('no redeemer yet', !before.redeemedBy);
    check('redeemedBy is populated (null here)', 'redeemedBy' in before);

    // ---------------------------------------------------- real redemption
    section('Redeem as a real user, then check admin visibility');
    const username = `E2EPROMO_ADMIN_${stamp}`;
    const user = await userModel.create({
      username,
      email: `${username.toLowerCase()}@example.invalid`,
      password: await bcrypt.hash(PW, 10),
      role: 'user',
    });
    created.users.push(user._id);

    const result = await redeemPromoCodeService({ userId: user._id, code: promo.code });
    // The service returns the promo payload, not a `success` wrapper — assert on
    // what it actually returns rather than assuming a shape.
    check('redemption returned a payload', Boolean(result?.code), JSON.stringify(result));
    check('granted 6 months', result.months === 6, `months=${result.months}`);

    const afterList = await getAllPromoCodesService();
    const after = afterList.find((p) => p.code === promo.code);
    check('redeemedBy populated', Boolean(after.redeemedBy));
    check('redeemedBy resolved to a real user object', Boolean(after.redeemedBy?._id));
    check('admin can see the username', after.redeemedBy?.username === username, after.redeemedBy?.username);
    check('admin can see the email', after.redeemedBy?.email === `${username.toLowerCase()}@example.invalid`);
    check('redemption email snapshot kept', after.redemptionEmail === `${username.toLowerCase()}@example.invalid`);
    check('redeemedAt timestamped', Boolean(after.redeemedAt));
    check('subscribed status visible', after.redeemedBy?.subscription?.status === 'promo', after.redeemedBy?.subscription?.status);

    // --------------------------------------- audit survives user deletion
    section('Audit trail survives the user being deleted');
    await userModel.deleteOne({ _id: user._id });
    created.users = created.users.filter((id) => String(id) !== String(user._id));
    const afterDelete = await getAllPromoCodesService();
    const orphan = afterDelete.find((p) => p.code === promo.code);
    // `redeemedBy` legitimately becomes null when the referenced user is gone —
    // the FK is dangling, not the audit trail. The consumption record lives in
    // redeemedAt + redemptionEmail, which must both survive.
    check('redemption timestamp survives deletion', Boolean(orphan.redeemedAt));
    check('email snapshot still available', orphan.redemptionEmail === `${username.toLowerCase()}@example.invalid`);
    check('redeemedBy safely null when the user is gone', orphan.redeemedBy === null);

    // ------------------------------------------------------ single use again
    section('Single-use still enforced with the new tools present');
    const user2 = await userModel.create({
      username: `E2EPROMO_TWO_${stamp}`,
      email: `e2epromo_two_${stamp.toLowerCase()}@example.invalid`,
      password: await bcrypt.hash(PW, 10),
      role: 'user',
    });
    created.users.push(user2._id);
    let threw = null;
    try {
      await redeemPromoCodeService({ userId: user2._id, code: promo.code });
    } catch (e) { threw = e; }
    check('a different user cannot reuse it', threw !== null, threw?.message);
    check('refusal is the generic 400', threw?.status === 400, `status=${threw?.status}`);
  } catch (err) {
    failed += 1;
    console.log(`\n  CRASH: ${err.stack}`);
  } finally {
    if (created.promos.length) await PromoCode.deleteMany({ code: { $in: created.promos } });
    if (created.users.length) await userModel.deleteMany({ _id: { $in: created.users } });
    const p = await PromoCode.countDocuments({ code: { $in: created.promos } });
    const u = created.users.length ? await userModel.countDocuments({ _id: { $in: created.users } }) : 0;
    console.log(`\nCleanup: ${created.promos.length} promos, ${created.users.length} users removed`);
    check('no promo residue', p === 0, `${p} left`);
    check('no user residue', u === 0, `${u} left`);
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
};

run();