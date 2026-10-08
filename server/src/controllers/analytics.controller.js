import { parseCompareIds, compareProperties } from '../services/compare.service.js';
import { parseMarketQuery, getMarketAnalytics } from '../services/analytics.service.js';

const fail = (res, e) =>
  res.status(e.status || 500).json({
    success: false,
    error: { code: e.code || 'INTERNAL_SERVER_ERROR', message: e.message || 'Unexpected error' },
  });

/** GET /api/properties/compare?ids=... (public; mounted in property routes). */
export const compare = async (req, res) => {
  try {
    const parsed = parseCompareIds(req.query.ids);
    if (!parsed.ok) {
      return fail(res, { status: 400, code: 'VALIDATION_ERROR', message: parsed.reason });
    }
    const result = await compareProperties(parsed.ids);
    return res.json({ success: true, data: result });
  } catch (e) {
    return fail(res, e);
  }
};

/** GET /api/analytics/market?city=...&listingType=... (public discovery). */
export const market = async (req, res) => {
  try {
    const parsed = parseMarketQuery({ city: req.query.city, listingType: req.query.listingType });
    if (!parsed.ok) {
      return fail(res, { status: 400, code: 'VALIDATION_ERROR', message: parsed.reason });
    }
    const analytics = await getMarketAnalytics(parsed);
    return res.json({ success: true, data: { analytics } });
  } catch (e) {
    return fail(res, e);
  }
};
