import mongoose from "mongoose";

const memberSchema = new mongoose.Schema({
  userId: { type: String, index: true, unique: true },
  done: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("Member", memberSchema);
