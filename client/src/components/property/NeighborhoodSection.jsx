import React, { useCallback, useEffect, useState } from 'react';
import {
  Bus,
  GraduationCap,
  ShoppingCart,
  Hospital,
  TreePine,
  Footprints,
  AlertCircle,
  MapPinOff,
} from 'lucide-react';
import propertyApi from '../../services/propertyApi';
import { POI_CATEGORY_LABELS, POI_CATEGORY_ORDER } from '../../lib/poiCategories';

const CATEGORY_ICONS = {
  transit: Bus,
  school: GraduationCap,
  grocery: ShoppingCart,
  healthcare: Hospital,
  park: TreePine,
};

/** "850 m" under a kilometre, otherwise "1.2 km". */
const formatDistance = (distanceMeter) => {
  if (typeof distanceMeter !== 'number' || !Number.isFinite(distanceMeter)) return '';
  return distanceMeter < 1000
    ? `${Math.round(distanceMeter)} m`
    : `${(distanceMeter / 1000).toFixed(1)} km`;
};

const TABS = [{ key: 'all', label: 'All', Icon: Footprints }].concat(
  POI_CATEGORY_ORDER.map((key) => ({
    key,
    label: POI_CATEGORY_LABELS[key],
    Icon: CATEGORY_ICONS[key],
  })),
);

const NeighborhoodSection = ({ propertyId, onPoisChange, onCategoryChange }) => {
  const [neighborhood, setNeighborhood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showMethod, setShowMethod] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await propertyApi.getNeighborhood(propertyId);
      const data = result?.data?.neighborhood || null;
      setNeighborhood(data);
      onPoisChange?.(data);
    } catch (err) {
      console.error('Failed to load neighborhood data:', err);
      setError('Could not load neighborhood data.');
    } finally {
      setLoading(false);
    }
    // onPoisChange is a parent callback; intentionally not an effect key.
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  // Keep the property map's POI layers in sync with the active tab.
  useEffect(() => {
    onCategoryChange?.(activeCategory);
  }, [activeCategory, onCategoryChange]);

  const visibleCategories =
    activeCategory === 'all'
      ? POI_CATEGORY_ORDER.filter((c) => (neighborhood?.categories?.[c] || []).length > 0)
      : [activeCategory];

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex h-40 items-center justify-center" role="status" aria-label="Loading neighborhood">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex min-h-11 items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      );
    }

    if (!neighborhood || !neighborhood.dataAvailable) {
      // First-class empty state (locked decision 3): "no data" is not an error.
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="rounded-full bg-gray-100 p-3 text-gray-400">
            <MapPinOff className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-600">
            Local amenity data isn&apos;t available around this location yet.
          </p>
          <p className="text-xs text-gray-400">
            Walkability insights appear once neighborhood points of interest are mapped for this area.
          </p>
        </div>
      );
    }

    const { walkScore } = neighborhood;

    return (
      <div className="space-y-5">
        {/* Walkability score */}
        {walkScore && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-indigo-600 text-lg font-bold text-indigo-700"
                  aria-label={`Walk score ${walkScore.total} out of 100`}
                >
                  {walkScore.total}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Walk Score</p>
                  <p className="text-xs text-gray-500">
                    0–100 density estimate within {neighborhood.radiusKm} km
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMethod((v) => !v)}
                aria-expanded={showMethod}
                className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                {showMethod ? 'Hide method' : 'How is this calculated?'}
              </button>
            </div>
            {showMethod && (
              <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 text-xs text-gray-600">
                <p>
                  Transparent formula — POIs closer than {walkScore.constants.nearM} m count fully,
                  fading to zero at {walkScore.constants.maxUsefulM} m; each category saturates
                  after {walkScore.constants.saturation} useful places; walking minutes assume{' '}
                  {walkScore.constants.walkMetersPerMinute} m/min.
                </p>
                <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {POI_CATEGORY_ORDER.map((c) => (
                    <li key={c} className="flex justify-between gap-2">
                      <span>{POI_CATEGORY_LABELS[c]}</span>
                      <span className="font-medium">
                        {Math.round(walkScore.weights[c] * 100)}% · {Math.round((walkScore.categories[c] || 0) * 100)}% used
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Amenity categories">
          {TABS.map(({ key, label, Icon }) => {
            const active = activeCategory === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(key)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {/* POI lists */}
        {visibleCategories.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            No {activeCategory === 'all' ? '' : POI_CATEGORY_LABELS[activeCategory].toLowerCase() + ' '}
            spots found within {neighborhood.radiusKm} km.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {visibleCategories.flatMap((category) =>
              (neighborhood.categories[category] || []).map((poi) => {
                const Icon = CATEGORY_ICONS[category] || Footprints;
                return (
                  <div
                    key={poi.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="shrink-0 rounded-md bg-gray-100 p-1.5 text-gray-500">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{poi.name}</p>
                        <p className="text-xs capitalize text-gray-500">
                          {POI_CATEGORY_LABELS[category]}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDistance(poi.distanceMeter)}
                      </p>
                      <p className="flex items-center justify-end gap-1 text-xs text-gray-500">
                        <Footprints className="h-3 w-3" aria-hidden="true" />
                        {poi.walkMinutes} min walk
                      </p>
                    </div>
                  </div>
                );
              }),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby="neighborhood-heading">
      <h2 id="neighborhood-heading" className="mb-4 text-xl font-semibold text-gray-900">
        Neighborhood &amp; Nearby Amenities
      </h2>
      {renderBody()}
    </section>
  );
};

export default NeighborhoodSection;
