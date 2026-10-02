/**
 * Renders a promo code's QR to a real PNG file.
 *
 * Uses the `qrcode` package. Kept server-side so the downloaded file is the
 * authoritative payload — the browser preview is a convenience, not the
 * source of truth, and two QR implementations can disagree on quiet zones
 * and error correction in ways that only show up on an old scanner.
 */
import QRCode from 'qrcode';

export const promoQrPngBuffer = async (payload, { scale = 12, margin = 2 } = {}) =>
  QRCode.toBuffer(String(payload), {
    type: 'png',
    // High correction: promo codes get printed on flyers and taped to walls.
    // A logo or a sticker can eat modules that a low-correction QR survives.
    errorCorrectionLevel: 'H',
    width: Math.max(4, Math.min(scale, 20)) * 25,
    margin,
    color: { dark: '#0f172aff', light: '#ffffffff' },
  });