import mongoose from "mongoose";

/**
 * A promo is an identifier that can be shared three ways:
 *   1. the random `code`  (typed by a user)
 *   2. the `link`         (shared as a URL)
 *   3. the `qrPayload`    (rendered as a QR code, encodes `link`)
 *
 * Redemption rules (discount type, duration, eligibility) are intentionally
 * NOT modelled yet — the behaviour is still being defined.
 *
 * A code is strictly single-use: see `redeemedBy` below.
 */
const PromoCodeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 120
    },
    code: {
      type: String,
      required: [true, "Code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    link: {
      type: String,
      required: [true, "Link is required"],
      trim: true
    },
    // Encoded into the QR image. Defaults to `link` on creation.
    qrPayload: {
      type: String,
      required: true,
      trim: true
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500
    },
    isActive: {
      type: Boolean,
      default: true
    },

    /**
     * SINGLE USE. `redeemedBy != null` means the code is consumed and can never
     * be redeemed again — not by another user, and not by the same user.
     *
     * Redemption claims this field with a single conditional findOneAndUpdate
     * (see redeemPromoCodeService) rather than read-then-write, so two
     * simultaneous requests can never both observe `redeemedBy: null` and
     * both grant access.
     */
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    redeemedAt: {
      type: Date,
      default: null
    },
    // Snapshot of the account that consumed it, kept for audit after the
    // user record is removed.
    redemptionEmail: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

// Supports the admin "who redeemed this" filter and the redemption lookups.
PromoCodeSchema.index({ redeemedBy: 1 });

const PromoCodeModel = mongoose.model("PromoCode", PromoCodeSchema);

export default PromoCodeModel;