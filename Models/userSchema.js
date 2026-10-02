import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    default: "user"
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    default: ""
  }
  ,
  interestTopic:[{
    type:mongoose.Schema.Types.ObjectId,
    ref:'topic'
  }],
  motivationPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MotivationPost'
    }
  ],
  scriptingNotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScriptingNote'
    }
  ],
  NursingTips: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NursingTipsSchema'
  }],
  sessionToken: {
    type: String,
    default: null
  },
  attemptedQuestions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'quizQuestion'
  }],
  lifetimeCorrectAnswers: {
    type: Number,
    default: 0
  },
  lifetimeTotalQuestions: {
    type: Number,
    default: 0
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  stripeCustomerId: {
    type: String,
    default: null
  },
  subscription: {
    stripeSubscriptionId: { type: String, default: null },
    status: {
      type: String,
      enum: ['none', 'trialing', 'active', 'past_due', 'suspended', 'canceled', 'promo'],
      default: 'none'
    },
    planId: { type: String, default: null },
    priceId: { type: String, default: null },
    premium: { type: Boolean, default: false },
    trialEndsAt: { type: Date, default: null },
    // Set the first time a trial actually starts. Prevents granting a fresh
    // trial on every checkout (cancel -> resubscribe trial loop).
    trialUsedAt: { type: Date, default: null },
    paidThrough: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    // Who initiated the terminal cancellation. Drives notification copy —
    // without it every user-cancel was reported as "canceled by an administrator".
    canceledBy: { type: String, enum: ['user', 'admin', null], default: null },
    cancelReason: { type: String, default: null },
    cancelRequestedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    suspendNotifiedAt: { type: Date, default: null },

    // Promo entitlement (single-use promo code redemption).
    // Kept separate from the Stripe fields so granting or expiring a promo can
    // never be mistaken for a paid subscription.
    promoCodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PromoCode', default: null },
    promoCodeText: { type: String, default: null },
    promoRedeemedAt: { type: Date, default: null },
    promoEndsAt: { type: Date, default: null },
    // Set when the free period lapsed. After this the user is back on the
    // normal paywall and must buy a plan.
    promoExpiredAt: { type: Date, default: null }
  }
}, { timestamps: true });

const userModel = mongoose.model('User', userSchema);
export default userModel;
