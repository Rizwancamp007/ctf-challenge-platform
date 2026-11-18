import mongoose from "mongoose";

// Every flag guess, right or wrong, so admins can see how a challenge
// is being worked on. The guess itself is never stored — only whether
// it was right.
const submissionSchema = new mongoose.Schema(
  {
    challenge: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    correct: { type: Boolean, required: true },
  },
  { timestamps: true }
);

export const Submission = mongoose.model("Submission", submissionSchema);
