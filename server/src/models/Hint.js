import mongoose from "mongoose";

// A hint belongs to one challenge and costs points to unlock. The text
// is only shown to a team that has unlocked it — locked hints show their
// cost and nothing else.
const hintSchema = new mongoose.Schema(
  {
    challenge: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    cost: { type: Number, required: true, min: 0, max: 500 },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const Hint = mongoose.model("Hint", hintSchema);
