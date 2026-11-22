import mongoose from "mongoose";

// One row per unlock — a hint is unlocked once per team, whoever on the
// team unlocks it, and the cost is taken off the team's score at that
// moment. cost is stored here so the scoreboard can deduct it even if
// the hint's price changes later.
const hintUnlockSchema = new mongoose.Schema(
  {
    challenge: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    hint: { type: mongoose.Schema.Types.ObjectId, ref: "Hint", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: String, default: null },
    cost: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// One unlock per team per hint — a second unlock by a teammate finds
// this row instead of charging again.
hintUnlockSchema.index(
  { hint: 1, teamId: 1 },
  { unique: true, partialFilterExpression: { teamId: { $type: "string" } } }
);

hintUnlockSchema.index({ hint: 1, user: 1 }, { unique: true });

export const HintUnlock = mongoose.model("HintUnlock", hintUnlockSchema);
