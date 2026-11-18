import mongoose from "mongoose";

export const CATEGORIES = ["crypto", "web", "reverse", "misc"];
export const DIFFICULTIES = ["easy", "medium", "hard"];

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

// Optional container setup for challenges that run as a service —
// the flag itself is never stored here, it only lives as a hash.
const containerSchema = new mongoose.Schema(
  {
    image: { type: String, trim: true },
    port: { type: Number },
    url: { type: String, trim: true },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    points: { type: Number, required: true, min: 10, max: 1000 },
    description: { type: String, default: "", trim: true },
    files: { type: [fileSchema], default: [] },
    container: { type: containerSchema, default: undefined },
    flagHash: { type: String, required: true },
    visible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Challenge = mongoose.model("Challenge", challengeSchema);
