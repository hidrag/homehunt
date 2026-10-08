/**
 * S14 (ADR-037) — price-drop saved-search sweep.
 *
 * Fire-and-forget sibling of the S10 creation sweep: called by the property
 * update funnel with the PREVIOUS price; never delays or fails the HTTP
 * response, every error is swallowed with `[PRICE_DROP_ERROR]` logging.
 *
 * Matching reuses the EXACT public-listings filter builder (locked ADR-029
 * "one matching implementation" rule): a saved search fires only when its
 * criteria STILL match this property AND the price genuinely dropped
 * (newPrice < oldPrice). One criteria evaluation, one decision.
 */
import Property from '../models/Property.js';
import SavedSearch from '../models/SavedSearch.js';
import User from '../models/User.js';
import { buildPropertyFilter } from '../lib/propertyFilters.js';
import { notifyPriceDrop } from './notification.service.js';

// Same per-sweep bound as the creation sweep (S10 precedent).
const SWEEP_LIMIT = 500;

export const sweepPriceDrops = async (property, oldPrice) => {
  try {
    const newPrice = Number(property.price);
    if (!(Number.isFinite(newPrice) && Number.isFinite(oldPrice) && newPrice < oldPrice)) return;

    const searches = await SavedSearch.find({ active: true }).limit(SWEEP_LIMIT).lean();
    const matched = [];
    for (const search of searches) {
      try {
        const filter = buildPropertyFilter(search.criteria || {});
        // Ask the same query engine whether THIS document still matches.
        if (await Property.exists({ _id: property._id, ...filter })) matched.push(search);
      } catch (error) {
        console.error('[PRICE_DROP_ERROR]', error.message);
      }
    }
    if (!matched.length) return;

    const ownerIds = [...new Set(matched.map((search) => String(search.user)))];
    const users = await User.find({ _id: { $in: ownerIds } }).select('email').lean();
    const emailByUser = new Map(users.map((user) => [String(user._id), user.email]));

    for (const search of matched) {
      await notifyPriceDrop(search, property, oldPrice, newPrice, emailByUser.get(String(search.user)));
    }
  } catch (error) {
    console.error('[PRICE_DROP_ERROR]', error.message);
  }
};

export default sweepPriceDrops;
