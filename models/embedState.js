import mongoose from "mongoose";

const embedStateSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  channelId: String,
  messageId: String
}, { timestamps: true });

export default mongoose.model("EmbedState", embedStateSchema);
