import React, { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { getMarketAnalytics } from '../../services/analyticsApi';

/**
 * S14 (ADR-037) — "How this listing compares" widget. Benchmarks the
 * listing's price per sqft against the city average across available
 * listings. Honesty rule: below the min-sample count the endpoint returns
 * dataAvailable: false and the widget quietly explains why — a one-listing
 * "average" is never shown.
 */
const pricePerSqft = (property) => {
  if (!(Number(property?.area) > 0) || typeof property?.price !== 'number') return null;
  return Math.round(property.price / property.area);
};

const MarketContext = ({ property }) => {
  const city = property?.address?.city;
  const listingPsf = pricePerSqft(property);
  const [state, setState] = useState({ loading: true, analytics: null });

  useEffect(() => {
    if (!city) return undefined;
    let active = true;
    setState({ loading: true, analytics: null });
    getMarketAnalytics({ city })
      .then((res) => active && setState({ loading: false, analytics: res?.data?.analytics || null }))
      .catch(() => active && setState({ loading: false, analytics: null }));
    return () => {
      active = false;
    };
  }, [city]);

  if (!city || listingPsf === null) return null;

  const { loading, analytics } = state;

  let verdict = null;
  if (analytics?.dataAvailable && analytics.stats?.avgPricePerSqft) {
    const ratio = listingPsf / analytics.stats.avgPricePerSqft;
    if (ratio < 0.95) verdict = { Icon: TrendingDown, label: 'Below city average', tone: 'text-emerald-600 bg-emerald-50' };
    else if (ratio > 1.05) verdict = { Icon: TrendingUp, label: 'Above city average', tone: 'text-amber-600 bg-amber-50' };
    else verdict = { Icon: Minus, label: 'At city average', tone: 'text-gray-600 bg-gray-100' };
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">How this listing compares</h2>
      <p className="mb-3 text-xs text-gray-500">
        Price per sqft vs other available {city} listings{analytics?.stats ? ` (${analytics.stats.count} sampled)` : ''}.
      </p>

      {loading && <p className="text-sm text-gray-400">Loading market context…</p>}

      {!loading && !analytics?.dataAvailable && (
        <p className="text-sm text-gray-500">
          Not enough recent {city} listings to compare yet — this appears when there are {analytics?.minSample || 3}+
          available homes in the city.
        </p>
      )}

      {!loading && analytics?.dataAvailable && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">This listing</span>
            <span className="font-semibold text-gray-900">₹{listingPsf.toLocaleString('en-IN')}/sqft</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">City average</span>
            <span className="font-medium text-gray-900">
              ₹{analytics.stats.avgPricePerSqft?.toLocaleString('en-IN') || '—'}/sqft
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">City median price</span>
            <span className="font-medium text-gray-900">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
                analytics.stats.medianPrice,
              )}
            </span>
          </div>
          {verdict && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${verdict.tone}`}>
              <verdict.Icon className="h-3.5 w-3.5" /> {verdict.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketContext;
