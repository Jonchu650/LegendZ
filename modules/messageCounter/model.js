import mongoose from "mongoose";

const messageStatSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  userId:  { type: String, index: true, required: true },
  weekKey: { type: String, index: true, required: true },
  count:   { type: Number, default: 0 }
}, { timestamps: true });

messageStatSchema.index({ guildId: 1, weekKey: 1, count: -1 });
messageStatSchema.index({ guildId: 1, weekKey: 1, userId: 1 }, { unique: true });

export default mongoose.model("MessageStat", messageStatSchema);
