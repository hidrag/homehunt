import Bookmark from '../models/Bookmark.js';
import Property from '../models/Property.js';

const PROPERTY_SUMMARY_PROJECTION = {
  title: 1,
  price: 1,
  propertyType: 1,
  listingType: 1,
  status: 1,
  images: 1,
  'address.city': 1,
  'address.state': 1,
  bedrooms: 1,
  bathrooms: 1,
  area: 1,
  createdAt: 1,
};

/**
 * Get paginated bookmarks for a user with populated property summaries
 */
export const listForUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [bookmarks, total] = await Promise.all([
    Bookmark.find({ user: userId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'property',
        select: PROPERTY_SUMMARY_PROJECTION,
      })
      .lean(),
    Bookmark.countDocuments({ user: userId }),
  ]);

  return {
    bookmarks,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

/**
 * Add a bookmark for the authenticated user
 * Returns { bookmark, alreadyExists }
 */
export const addBookmark = async (userId, propertyId) => {
  // Verify property exists
  const property = await Property.findById(propertyId).select('_id').lean();
  if (!property) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Property not found' };
  }

  try {
    const bookmark = await Bookmark.create({
      user: userId,
      property: propertyId,
    });

    return { bookmark: bookmark.toObject(), alreadyExists: false };
  } catch (err) {
    // Handle duplicate key error (E11000) — idempotent success
    if (err.code === 11000) {
      const existing = await Bookmark.findOne({
        user: userId,
        property: propertyId,
      }).lean();

      return { bookmark: existing, alreadyExists: true };
    }
    throw err;
  }
};

/**
 * Remove a bookmark for the authenticated user
 * Returns { removed: boolean }
 */
export const removeBookmark = async (userId, propertyId) => {
  const result = await Bookmark.deleteOne({
    user: userId,
    property: propertyId,
  });

  return { removed: result.deletedCount > 0 };
};

/**
 * Get all bookmarked property IDs for the authenticated user
 */
export const listPropertyIds = async (userId) => {
  const bookmarks = await Bookmark.find({ user: userId })
    .select('property')
    .lean();

  return bookmarks.map((b) => b.property.toString());
};
