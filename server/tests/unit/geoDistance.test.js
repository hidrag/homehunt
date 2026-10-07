/**
 * S12 — Unit checks for the shared neighborhood math (ADR-034).
 *
 * Pure-function coverage: Haversine accuracy against exact spherical-circle
 * references, deterministic walking-minute rounding, the published utility
 * decay curve, and the deterministic 0–100 walkability score including the
 * empty-set null guard. Database behaviour lives in neighborhood.mongo.test.js.
 */
import {
  POI_CATEGORIES,
  WALK_WEIGHTS,
  haversineMeters,
  walkingMinutes,
  poiUtility,
  computeWalkScore,
} from '../../src/lib/geoDistance.js';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters([77.5946, 12.9716], [77.5946, 12.9716])).toBe(0);
  });

  it('matches the exact 1-degree latitude arc on the mean sphere (~111195 m)', () => {
    const d = haversineMeters([0, 0], [0, 1]);
    // 6371 km * 1 degree in radians = 111194.9 m exactly for this model.
    expect(d).toBeCloseTo(111194.9, -1);
  });

  it('matches the exact quarter-meridian (~10007.5 km)', () => {
    const d = haversineMeters([0, 0], [0, 90]);
    expect(d).toBeCloseTo(10007543, -3); // within ~±500 m of quarter circumference
  });

  it('is symmetric and scales cos(lat) for east-west arcs', () => {
    const mumbai = [72.8258, 19.0544];
    const east = [72.8358, 19.0544];
    const d = haversineMeters(mumbai, east);
    const latArc = haversineMeters([0, 0], [0, 0.01]);
    // 1 deg E-W at ~19° lat ≈ 0.9455 of the N-S arc.
    expect(d).toBeCloseTo(latArc * Math.cos((19.0544 * Math.PI) / 180), -2);
  });
});

describe('walkingMinutes', () => {
  it('rounds up at 80 m/min and maps 0 m to 0 min', () => {
    expect(walkingMinutes(0)).toBe(0);
    expect(walkingMinutes(80)).toBe(1);
    expect(walkingMinutes(81)).toBe(2);
    expect(walkingMinutes(800)).toBe(10);
    expect(walkingMinutes(801)).toBe(11);
  });
});

describe('poiUtility (published decay curve)', () => {
  it('is 1 at or under 400 m across the whole low band', () => {
    expect(poiUtility(0)).toBe(1);
    expect(poiUtility(200)).toBe(1);
    expect(poiUtility(400)).toBe(1);
  });

  it('decays linearly between 400 m and 1600 m', () => {
    expect(poiUtility(1000)).toBeCloseTo(0.5, 10);
    expect(poiUtility(600)).toBeCloseTo(5 / 6, 10);
    expect(poiUtility(1400)).toBeCloseTo(1 / 6, 10);
  });

  it('is 0 at and beyond 1600 m', () => {
    expect(poiUtility(1600)).toBe(0);
    expect(poiUtility(5000)).toBe(0);
  });
});

describe('computeWalkScore (deterministic, explainable)', () => {
  const poi = (category, distanceMeter) => ({ category, distanceMeter });

  it('returns null (never 0) for an empty candidate set', () => {
    expect(computeWalkScore([])).toBeNull();
    expect(computeWalkScore()).toBeNull();
  });

  it('weight constants sum to 1.0 and cover the category whitelist', () => {
    const sum = Object.values(WALK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(Object.keys(WALK_WEIGHTS).sort()).toEqual([...POI_CATEGORIES].sort());
  });

  it('single close POI yields exactly weight/5 of its category', () => {
    const score = computeWalkScore([poi('transit', 350)]);
    // utility 1 → sub = 1/5 → 100 × 0.30 × 0.2 = 6
    expect(score.total).toBe(6);
    expect(score.categories.transit).toBeCloseTo(0.2, 6);
    expect(score.categories.park).toBe(0);
  });

  it('saturates a category at 5 useful POIs (a 6th changes nothing)', () => {
    const five = Array.from({ length: 5 }, () => poi('transit', 200));
    const six = [...five, poi('transit', 250)];
    expect(computeWalkScore(five).categories.transit).toBe(1);
    expect(computeWalkScore(six).categories.transit).toBe(1);
  });

  it('full dense neighborhood scores 100 with every sub-score at 1', () => {
    const dense = POI_CATEGORIES.flatMap((c) => Array.from({ length: 5 }, () => poi(c, 300)));
    const score = computeWalkScore(dense);
    expect(score.total).toBe(100);
    expect(Object.values(score.categories).every((v) => v === 1)).toBe(true);
  });

  it('applies distance decay to the aggregate', () => {
    // All five POIs of each category at 1000 m -> utility 0.5 -> sub 0.5 ->
    // weighted = 0.5 -> total 50.
    const decayed = POI_CATEGORIES.flatMap((c) =>
      Array.from({ length: 5 }, () => poi(c, 1000)),
    );
    expect(computeWalkScore(decayed).total).toBe(50);
  });

  it('ignores candidates with unknown categories without breaking the score', () => {
    const score = computeWalkScore([
      poi('transit', 200),
      poi('volcano', 100),
    ]);
    expect(score.total).toBe(6);
  });

  it('exposes the published constants and weights in the payload', () => {
    const score = computeWalkScore([poi('park', 500)]);
    expect(score.weights).toEqual(WALK_WEIGHTS);
    expect(score.constants).toMatchObject({ nearM: 400, maxUsefulM: 1600, saturation: 5 });
  });
});
