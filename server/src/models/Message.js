import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, minlength: 1, maxlength: 2000, trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Index for paginated conversation history (deterministic ordering)
messageSchema.index({ conversation: 1, createdAt: 1, _id: 1 });

export default mongoose.model('Message', messageSchema);