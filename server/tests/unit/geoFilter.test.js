/**
 * S11 — Geospatial filter builder unit suite (ADR-031).
 *
 * Pure-function coverage of buildGeoFilter / buildPropertyFilter geo keys:
 * $centerSphere conversion, closed-Polygon ($geometry) orientation,
 * strict-validate-on-present
 * rejection matrix (GEO_INVALID), and composition with the S2 vocabulary.
 */
import {
  buildGeoFilter,
  buildPropertyFilter,
  buildCanonicalQuery,
  EARTH_RADIUS_KM,
} from '../../src/lib/propertyFilters.js';

const expectGeoInvalid = (fn, fragment) => {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeTruthy();
  expect(thrown.status).toBe(400);
  expect(thrown.code).toBe('GEO_INVALID');
  if (fragment) expect(thrown.message).toContain(fragment);
};

describe('S11 buildGeoFilter — radius ($centerSphere)', () => {
  it('returns {} with no geo keys', () => {
    expect(buildGeoFilter({})).toEqual({});
    expect(buildGeoFilter({ city: 'x' })).toEqual({});
  });

  it('converts radiusKm to radians over 6378.1 with [lng, lat] centre', () => {
    const filter = buildGeoFilter({ lat: '12.97', lng: '77.59', radiusKm: '10' });
    expect(filter).toEqual({
      location: {
        $geoWithin: {
          $centerSphere: [[77.59, 12.97], 10 / 6378.1],
        },
      },
    });
    expect(EARTH_RADIUS_KM).toBe(6378.1);
  });

  it('accepts boundary values (poles, ±180, radius 0-exclusive..100)', () => {
    expect(buildGeoFilter({ lat: 90, lng: 180, radiusKm: 100 }).location.$geoWithin.$centerSphere[1])
      .toBe(100 / 6378.1);
    buildGeoFilter({ lat: -90, lng: -180, radiusKm: 0.001 }); // must not throw
  });

  it('rejects a partial geo group (all-or-none)', () => {
    expectGeoInvalid(() => buildGeoFilter({ lat: 12 }), 'provided together');
    expectGeoInvalid(() => buildGeoFilter({ lat: 12, lng: 77 }), 'provided together');
    expectGeoInvalid(() => buildGeoFilter({ radiusKm: 5 }), 'provided together');
  });

  it('rejects out-of-range and non-finite scalars', () => {
    expectGeoInvalid(() => buildGeoFilter({ lat: 91, lng: 0, radiusKm: 5 }), 'lat must be between');
    expectGeoInvalid(() => buildGeoFilter({ lat: -91, lng: 0, radiusKm: 5 }));
    expectGeoInvalid(() => buildGeoFilter({ lat: 0, lng: 181, radiusKm: 5 }), 'lng must be between');
    expectGeoInvalid(() => buildGeoFilter({ lat: 0, lng: -181, radiusKm: 5 }));
    expectGeoInvalid(() => buildGeoFilter({ lat: 'NaN', lng: 0, radiusKm: 5 }), 'finite');
    expectGeoInvalid(() => buildGeoFilter({ lat: 'Infinity', lng: 0, radiusKm: 5 }));
    expectGeoInvalid(() => buildGeoFilter({ lat: {}, lng: 0, radiusKm: 5 }), 'finite');
    expectGeoInvalid(() => buildGeoFilter({ lat: 0, lng: 0, radiusKm: 0 }), 'radiusKm');
    expectGeoInvalid(() => buildGeoFilter({ lat: 0, lng: 0, radiusKm: -1 }));
    expectGeoInvalid(() => buildGeoFilter({ lat: 0, lng: 0, radiusKm: 100.1 }), '100');
  });
});

describe('S11 buildGeoFilter — bounds ($geometry Polygon)', () => {
  it('orients a closed 5-point Polygon from URL order (lat-first)', () => {
    const filter = buildGeoFilter({ bounds: '12.9,77.5,13.1,77.7' });
    expect(filter).toEqual({
      location: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [[
              [77.5, 12.9],
              [77.7, 12.9],
              [77.7, 13.1],
              [77.5, 13.1],
              [77.5, 12.9],
            ]],
          },
        },
      },
    });
    // Ring must be closed: first === last vertex.
    const ring = filter.location.$geoWithin.$geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
  });

  it('accepts degenerate (zero-area) and antipode-edge-valid boxes', () => {
    buildGeoFilter({ bounds: '0,0,0,0' });
    buildGeoFilter({ bounds: '-90,-180,90,180' });
  });

  it('rejects malformed bounds strings', () => {
    expectGeoInvalid(() => buildGeoFilter({ bounds: '12.9,77.5,13.1' }), 'minLat,minLng,maxLat,maxLng');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '12.9,77.5,13.1,77.7,80' }));
    expectGeoInvalid(() => buildGeoFilter({ bounds: '12.9,,13.1,77.7' }));
    expectGeoInvalid(() => buildGeoFilter({ bounds: 'abc,77.5,13.1,77.7' }), 'bounds[0]');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '12.9,NaN,13.1,77.7' }));
  });

  it('rejects inverted and antimeridian-crossing boxes', () => {
    expectGeoInvalid(() => buildGeoFilter({ bounds: '13.1,77.5,12.9,77.7' }), 'minLat cannot exceed maxLat');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '12.9,170,13.1,-170' }), 'antimeridian');
  });

  it('rejects out-of-range box coordinates', () => {
    expectGeoInvalid(() => buildGeoFilter({ bounds: '-91,0,10,10' }), 'latitudes');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '0,-181,10,10' }), 'longitudes');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '0,0,91,10' }), 'latitudes');
    expectGeoInvalid(() => buildGeoFilter({ bounds: '0,0,10,181' }), 'longitudes');
  });

  it('ANDs radius and bounds into separate clauses (no duplicate location key)', () => {
    const filter = buildGeoFilter({
      lat: 12.97, lng: 77.59, radiusKm: 5,
      bounds: '12.9,77.5,13.1,77.7',
    });
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0].location.$geoWithin.$centerSphere).toBeTruthy();
    expect(filter.$and[1].location.$geoWithin.$geometry.type).toBe('Polygon');
    // The serialized filter must not carry a top-level location key.
    expect(filter.location).toBeUndefined();
  });
});

describe('S11 buildPropertyFilter — composition', () => {
  it('composes geo with text, city, price, type and bedrooms', () => {
    const filter = buildPropertyFilter({
      search: 'villa',
      city: 'Bengaluru',
      listingType: 'sale',
      minPrice: 100,
      maxPrice: 500,
      bedrooms: 2,
      lat: 12.97,
      lng: 77.59,
      radiusKm: 10,
    });
    expect(filter.$text).toEqual({ $search: 'villa' });
    expect(filter['address.city'] instanceof RegExp).toBe(true);
    expect(filter.listingType).toBe('sale');
    expect(filter.price).toEqual({ $gte: 100, $lte: 500 });
    expect(filter.bedrooms).toEqual({ $gte: 2 });
    expect(filter.location.$geoWithin.$centerSphere).toEqual([[77.59, 12.97], 10 / 6378.1]);
  });

  it('propagates GEO_INVALID through the main builder', () => {
    expectGeoInvalid(() => buildPropertyFilter({ bounds: 'bogus' }));
    expectGeoInvalid(() => buildPropertyFilter({ lat: 12.97, lng: 77.59 }));
  });

  it('ignores unknown keys (builder remains the only operator emitter)', () => {
    const filter = buildPropertyFilter({ $where: 'sleep(1)', location: { $exists: true } });
    expect(filter).toEqual({});
  });

  it('injects geo scalars but never bounds into the canonical querystring', () => {
    expect(buildCanonicalQuery({ lat: 12.97, lng: 77.59, radiusKm: 5 }))
      .toBe('?lat=12.97&lng=77.59&radiusKm=5');
    const withBounds = buildCanonicalQuery({ city: 'Bengaluru', bounds: '1,2,3,4' });
    expect(withBounds).toBe('?city=Bengaluru');
  });
});
