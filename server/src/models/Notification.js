import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Always server-derived from persisted event participants (ADR-030); never request input.
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: ['listing_match', 'visit_update', 'message_alert', 'inquiry_update', 'verification_update', 'price_drop'],
    },
    // Server-authored template text (max lengths per docs/04 S10 contract)
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    // Referenced entities are never cascade-deleted (ADR-025 pattern):
    // a deleted target renders "no longer available" via this ref.
    resourceRef: {
      kind: { type: String, enum: ['property', 'visit', 'conversation', 'inquiry'], default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: { updatedAt: false } },
);

// Inbox, newest first
notificationSchema.index({ recipient: 1, createdAt: -1 });
// Unread count / unread filter
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);