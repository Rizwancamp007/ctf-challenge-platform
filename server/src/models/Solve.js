import mongoose from "mongoose";

// One row per team solve — a challenge counts once per team, whoever on
// the team submits the flag. Until teams exist, each player solves alone,
// so the user is the scope. points is what the solve was worth at the
// time, so later scoring changes never rewrite history.
const solveSchema = new mongoose.Schema(
  {
    challenge: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: String, default: null },
    points: { type: Number, required: true },
  },
  { timestamps: true }
);

solveSchema.index({ challenge: 1, user: 1 }, { unique: true });

export const Solve = mongoose.model("Solve", solveSchema);
