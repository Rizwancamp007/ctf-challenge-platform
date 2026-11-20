import mongoose from "mongoose";

// A team is up to four players who solve together. The captain manages
// the roster. The invite code is the only way in — there is no open
// joining — and a solve counts once per team, whoever submits the flag.
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    inviteCode: { type: String, required: true, unique: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const Team = mongoose.model("Team", teamSchema);
