import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff, ExternalLink } from 'lucide-react';
import { isValidGeoPoint, toLeafletLatLng, toOsmLink } from '../../lib/propertyLocation';

// Safe custom SVG marker icon without asset path dependencies
const createMarkerIcon = () => {
  return L.divIcon({
    className: 'homehunt-map-pin',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background-color:#4f46e5;color:white;border-radius:50%;box-shadow:0 4px 6px -1px rgba(0,0,0,0.3),0 2px 4px -2px rgba(0,0,0,0.2);border:2px solid white;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

const PropertyMap = ({
  location,
  title = 'Property',
  className = '',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapError, setMapError] = useState(false);

  const isValid = isValidGeoPoint(location);

  const latLng = useMemo(() => {
    return isValid ? toLeafletLatLng(location) : null;
  }, [isValid, location]);

  useEffect(() => {
    if (!isValid || !latLng || !mapContainerRef.current) {
      return;
    }

    const container = mapContainerRef.current;
    let timer;

    try {
      const map = L.map(container, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView(latLng, 14);

      mapInstanceRef.current = map;

      // OpenStreetMap tile layer with attribution
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Safe marker and popup (DOM textContent to prevent XSS)
      const marker = L.marker(latLng, { icon: createMarkerIcon() }).addTo(map);

      const popupNode = document.createElement('div');
      popupNode.className = 'text-sm font-semibold text-gray-900 py-0.5 px-1';
      popupNode.textContent = title;
      marker.bindPopup(popupNode);

      // Invalidate size once container is rendered to prevent partial tile glitches
      timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);
    } catch (err) {
      console.error('Failed to initialize Leaflet property map:', err);
      setMapError(true);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isValid, latLng, title]);

  // Fallback for missing/invalid coordinates or Leaflet init error
  if (!isValid || !latLng || mapError) {
    return (
      <div
        className={`flex h-64 w-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-100 p-8 text-center sm:h-80 lg:h-96 ${className}`}
        role="region"
        aria-label="Property location"
      >
        <div className="mb-3 rounded-full bg-gray-200/80 p-3.5 text-gray-400">
          <MapPinOff className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-600">Location not available for this listing</p>
      </div>
    );
  }

  const [lat, lng] = latLng;
  const osmUrl = toOsmLink(lat, lng);

  return (
    <div className={`space-y-2.5 ${className}`} role="region" aria-label="Property location map">
      <div
        ref={mapContainerRef}
        className="h-64 w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm sm:h-80 lg:h-96"
      />
      {osmUrl && (
        <div className="flex justify-end">
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <span>Open in OpenStreetMap</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
};

export default PropertyMap;
