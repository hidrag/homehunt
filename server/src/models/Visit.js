import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  status: { type: String, enum: ['pending', 'confirmed', 'declined', 'cancelled', 'completed'], default: 'pending' },
  note: { type: String, trim: true, maxlength: 2000 },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

visitSchema.index({ buyer: 1, startAt: -1 });
visitSchema.index({ agent: 1, startAt: -1 });
visitSchema.index({ agent: 1, status: 1, startAt: 1 });
visitSchema.index({ buyer: 1, property: 1, startAt: 1, endAt: 1 }, {
  unique: true,
  partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } },
});

export default mongoose.model('Visit', visitSchema);
