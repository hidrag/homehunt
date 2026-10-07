/**
 * Saved-search matching sweep (S10, ADR-029).
 *
 * Runs inline fire-and-forget after a successful Property creation:
 * `void matchSavedSearches(property)` from the property service. The sweep
 * never delays or fails the HTTP response — every error (per-search or
 * global) is swallowed with `[MATCH_ERROR]` logging (locked decision 3).
 *
 * Matching reuses the EXACT public-listings filter builder
 * (`lib/propertyFilters.js`) so a saved search and the live search a buyer
 * saved can never drift (locked decision 7).
 */
import Property from '../models/Property.js';
import SavedSearch from '../models/SavedSearch.js';
import User from '../models/User.js';
import { buildPropertyFilter } from '../lib/propertyFilters.js';
import { notifyListingMatch } from './notification.service.js';

// Safety bound for a single sweep at S10 scale (single-process boundary).
const SWEEP_LIMIT = 500;

export const matchSavedSearches = async (property) => {
  try {
    const searches = await SavedSearch.find({ active: true }).limit(SWEEP_LIMIT).lean();
    const matched = [];
    for (const search of searches) {
      try {
        const filter = buildPropertyFilter(search.criteria || {});
        // Ask the same query engine whether THIS document matches — there is
        // deliberately no second matching implementation.
        if (await Property.exists({ _id: property._id, ...filter })) matched.push(search);
      } catch (error) {
        // One bad criteria document must not abort the whole sweep.
        console.error('[MATCH_ERROR]', error.message);
      }
    }
    if (!matched.length) return;

    const ownerIds = [...new Set(matched.map((search) => String(search.user)))];
    const users = await User.find({ _id: { $in: ownerIds } }).select('email').lean();
    const emailByUser = new Map(users.map((user) => [String(user._id), user.email]));

    for (const search of matched) {
      await notifyListingMatch(search, property, emailByUser.get(String(search.user)));
    }

    await SavedSearch.updateMany(
      { _id: { $in: matched.map((search) => search._id) } },
      { $set: { lastNotifiedAt: new Date() } },
    );
  } catch (error) {
    console.error('[MATCH_ERROR]', error.message);
  }
};