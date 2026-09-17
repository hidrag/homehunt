/**
 * Geographic validation and conversion utilities for Property locations.
 *
 * MongoDB GeoJSON contract stores coordinates as [longitude, latitude].
 * Leaflet requires coordinates as [latitude, longitude].
 */

/**
 * Validates whether an object represents a valid GeoJSON Point with sensible coordinates.
 *
 * @param {Object} location - GeoJSON location object
 * @returns {boolean} True if valid GeoJSON Point, false otherwise
 */
export const isValidGeoPoint = (location) => {
  if (!location || typeof location !== 'object') {
    return false;
  }

  if (location.type !== 'Point') {
    return false;
  }

  if (!Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
    return false;
  }

  const [lng, lat] = location.coordinates;

  if (typeof lng !== 'number' || !Number.isFinite(lng)) {
    return false;
  }

  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    return false;
  }

  // Longitude must be within [-180, 180]
  if (lng < -180 || lng > 180) {
    return false;
  }

  // Latitude must be within [-90, 90]
  if (lat < -90 || lat > 90) {
    return false;
  }

  return true;
};

/**
 * Converts a GeoJSON location [longitude, latitude] to Leaflet [latitude, longitude].
 *
 * @param {Object} location - GeoJSON location object
 * @returns {[number, number]|null} Leaflet [lat, lng] array or null if invalid
 */
export const toLeafletLatLng = (location) => {
  if (!isValidGeoPoint(location)) {
    return null;
  }

  const [lng, lat] = location.coordinates;
  return [lat, lng];
};

/**
 * Generates an external OpenStreetMap link for a given latitude and longitude.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} [zoom=16] - Map zoom level
 * @returns {string|null} Safe OpenStreetMap URL or null if invalid
 */
export const toOsmLink = (lat, lng, zoom = 16) => {
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
};
