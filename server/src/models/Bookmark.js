import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate bookmarks for the same user+property pair
bookmarkSchema.index({ user: 1, property: 1 }, { unique: true });

// Efficient listing: user's bookmarks ordered newest first
bookmarkSchema.index({ user: 1, createdAt: -1 });

const Bookmark = mongoose.model('Bookmark', bookmarkSchema);

export default Bookmark;
