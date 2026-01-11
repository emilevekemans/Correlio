import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema(
  {
    email: { type: String, default: null },
    provider: { type: String, default: null },
    userId: { type: String, default: null },

    message: { type: String, required: true },

    page: { type: String, default: null },
    selectedAssets: { type: [String], default: [] },

    yearStart: { type: Number, default: null },
    yearEnd: { type: Number, default: null },
    capPct: { type: Number, default: null },
    rollingWindowMonths: { type: Number, default: null },

    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    userAgent: { type: String, default: null },
    ip: { type: String, default: null }
  },
  { timestamps: true }
);

export const Feedback = mongoose.model("Feedback", FeedbackSchema);
