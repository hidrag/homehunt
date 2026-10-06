import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: {
      body: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      sentAt: { type: Date, default: null },
    },
    buyerUnread: { type: Number, default: 0 },
    agentUnread: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Indexes for inbox listing (newest activity first)
conversationSchema.index({ buyer: 1, updatedAt: -1 });
conversationSchema.index({ agent: 1, updatedAt: -1 });

// Unique: one conversation per (property, buyer) pair
conversationSchema.index({ property: 1, buyer: 1 }, { unique: true });

export default mongoose.model('Conversation', conversationSchema);