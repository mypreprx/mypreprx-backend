import crypto from 'crypto';
import PromoCode from '../../../Models/promoCodeSchema.js';
import userModel from '../../../Models/userSchema.js';

// Excludes I, O, 0 and 1 so a code still reads correctly when typed aloud
// or copied off a printed poster.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 12;

const clientBaseUrl = () =>
  String(process.env.CLIENT_URL).replace(/\/+$/, '');

export const buildPromoLink = (code) => `${clientBaseUrl()}/promo/${code}`;

export const generateCodeString = (length = CODE_LENGTH) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
};

/** Uppercase and drop anything that is not A-Z, 0-9 or a dash. */
export const normalizeCode = (value) =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);

const httpError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * Returns an admin-supplied code if given, otherwise generates a random one.
 * Rejects rather than silently overwriting when a code is already taken.
 */
const resolveUniqueCode = async (requested) => {
  if (requested) {
    if (await PromoCode.findOne({ code: requested })) {
      throw httpError(`Promo code "${requested}" already exists`, 409);
    }
    return requested;
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateCodeString();
    if (!(await PromoCode.findOne({ code: candidate }))) return candidate;
  }

  throw httpError('Could not generate a unique promo code. Please try again.', 500);
};

export const createPromoCodeService = async ({
  title,
  code,
  link,
  qrPayload,
  notes,
  isActive,
} = {}) => {
  if (!title || !String(title).trim()) {
    throw httpError('Title is required', 400);
  }

  const resolvedCode = await resolveUniqueCode(normalizeCode(code));
  const resolvedLink = String(link || '').trim() || buildPromoLink(resolvedCode);

  return PromoCode.create({
    title: String(title).trim(),
    code: resolvedCode,
    link: resolvedLink,
    qrPayload: String(qrPayload || '').trim() || resolvedLink,
    notes: String(notes || '').trim(),
    isActive: isActive !== false,
  });
};

/**
 * Populate the redeeming account so the admin list can show who used the code.
 * `redemptionEmail` is the snapshot fallback: if the user row is later deleted
 * the audit trail survives.
 */
export const getAllPromoCodesService = () =>
  PromoCode.find()
    .populate('redeemedBy', 'username email subscription.status subscription.promoEndsAt createdAt')
    .sort({ createdAt: -1 });

export const getPromoCodeByIdService = (id) => PromoCode.findById(id);

/** Lookup used when a user redeems a code. Reserved for the redemption flow. */
export const getPromoCodeByCodeService = (code) =>
  PromoCode.findOne({ code: normalizeCode(code) });

export const updatePromoCodeService = async (id, data = {}) => {
  const promo = await PromoCode.findById(id);
  if (!promo) throw httpError('Promo code not found', 404);

  const previousLink = promo.link;
  let codeChanged = false;

  if (data.code !== undefined) {
    const nextCode = normalizeCode(data.code);
    if (nextCode && nextCode !== promo.code) {
      if (await PromoCode.findOne({ code: nextCode })) {
        throw httpError(`Promo code "${nextCode}" already exists`, 409);
      }
      promo.code = nextCode;
      codeChanged = true;
    }
  }

  if (data.title !== undefined && String(data.title).trim()) {
    promo.title = String(data.title).trim();
  }
  if (data.notes !== undefined) promo.notes = String(data.notes).trim();
  if (data.isActive !== undefined) promo.isActive = Boolean(data.isActive);

  // An explicit link always wins; otherwise a changed code re-derives it.
  const explicitLink = String(data.link || '').trim();
  if (explicitLink) promo.link = explicitLink;
  else if (codeChanged) promo.link = buildPromoLink(promo.code);

  // Keep a QR that merely mirrored the old link in sync with it.
  const explicitPayload = String(data.qrPayload || '').trim();
  if (explicitPayload) promo.qrPayload = explicitPayload;
  else if (promo.qrPayload === previousLink) promo.qrPayload = promo.link;

  return promo.save();
};

export const deletePromoCodeService = async (id) => {
  const promo = await PromoCode.findByIdAndDelete(id);
  if (!promo) throw httpError('Promo code not found', 404);

  // Deleting a code must also withdraw the access it handed out, otherwise the
  // redeemer keeps premium with no code behind it (the exact gap that left
  // users premium after old codes were removed). Only an entitlement still
  // owned by THIS promo is touched, so a paid plan can never be affected.
  if (promo.redeemedBy) {
    await userModel.updateOne(
      {
        _id: promo.redeemedBy,
        'subscription.status': 'promo',
        'subscription.promoCodeId': promo._id,
      },
      {
        $set: {
          'subscription.status': 'canceled',
          'subscription.premium': false,
          'subscription.cancelAtPeriodEnd': false,
          'subscription.canceledBy': 'admin',
          'subscription.cancelReason': 'promo_revoked_by_admin',
          'subscription.canceledAt': new Date(),
        },
      }
    );
  }

  return { id: promo._id, title: promo.title, code: promo.code };
};