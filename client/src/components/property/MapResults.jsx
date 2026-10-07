import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff } from 'lucide-react';
import { isValidGeoPoint } from '../../lib/propertyLocation';

/**
 * S11 multi-property results map (ADR-032).
 *
 * Direct Leaflet lifecycle in useEffect (ADR-007 — no react-leaflet):
 * the map instance is created once; markers/clusters re-render on data or
 * zoom change. In-house pixel-grid clustering (~60px cells, zero deps).
 * Viewport moves are debounced and published as a `bounds` URL param via
 * onViewBounds; app-driven fitBounds is flagged so it can't echo back.
 */

const GRID_PX = 60;
const MOVE_DEBOUNCE_MS = 350;

const fmt = (price) => {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
};

const priceBadgeIcon = (label, selected) =>
  L.divIcon({
    className: 'homehunt-map-pin',
    html: `<div style="white-space:nowrap;padding:3px 8px;border-radius:9999px;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);background-color:${selected ? '#4338ca' : '#4f46e5'};color:white;">${label}</div>`,
    iconSize: [70, 26],
    iconAnchor: [35, 13],
  });

const clusterBadgeIcon = (count) =>
  L.divIcon({
    className: 'homehunt-map-pin',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background-color:#0f766e;color:white;font-weight:700;font-size:13px;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,.35);">${count > 99 ? '99+' : count}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });

const MapResults = ({
  properties = [],
  selectedId = null,
  onSelect = () => {},
  onViewBounds = () => {},
  center, // optional { lat, lng, radiusKm } radius overlay from URL
  boundsParam = '',
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const circleRef = useRef(null);
  const programmaticRef = useRef(false);
  const fittedOnceRef = useRef(false);
  const onViewBoundsRef = useRef(onViewBounds);
  const onSelectRef = useRef(onSelect);
  onViewBoundsRef.current = onViewBounds;
  onSelectRef.current = onSelect;

  const [mapError, setMapError] = useState(false);

  const points = properties
    .filter((p) => isValidGeoPoint(p.location))
    .map((p) => ({
      id: p._id,
      title: p.title,
      priceLabel: fmt(p.price),
      lat: p.location.coordinates[1],
      lng: p.location.coordinates[0],
    }));

  // 1. Create the map once; publish debounced viewport bounds.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let map;
    try {
      map = L.map(containerRef.current, {
        center: [20.5937, 78.9629],
        zoom: 5,
        scrollWheelZoom: false,
        zoomControl: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    } catch {
      setMapError(true);
      return undefined;
    }
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    // Keep Leaflet's size bookkeeping correct when the panel toggles
    // between hidden (mobile view switch) and visible.
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
      resizeObserver.observe(container);
    }

    let timer = null;
    const publish = () => {
      if (programmaticRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const b = map.getBounds();
        const round = (v) => Number(v.toFixed(4));
        onViewBoundsRef.current(
          `${round(b.getSouth())},${round(b.getWest())},${round(b.getNorth())},${round(b.getEast())}`,
        );
      }, MOVE_DEBOUNCE_MS);
    };
    map.on('moveend', publish);
    map.on('zoomend', publish);

    // Honor an explicit bounds param on first mount (shareable links).
    const parts = String(boundsParam).split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      programmaticRef.current = true;
      map.fitBounds([[parts[0], parts[1]], [parts[2], parts[3]]], { padding: [20, 20] });
      setTimeout(() => { programmaticRef.current = false; }, 300);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Radius overlay from URL geo params.
  const centerLat = center?.lat;
  const centerLng = center?.lng;
  const centerRadius = center?.radiusKm;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      circleRef.current = L.circle([centerLat, centerLng], {
        radius: (Number(centerRadius) || 5) * 1000,
        color: '#4f46e5',
        weight: 2,
        fillOpacity: 0.06,
      }).addTo(map);
    }
  }, [centerLat, centerLng, centerRadius]);

  // 3. Fit once to the first results when no explicit viewport exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedOnceRef.current || boundsParam) return;
    if (points.length === 0) return;
    fittedOnceRef.current = true;
    programmaticRef.current = true;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
    }
    setTimeout(() => { programmaticRef.current = false; }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties.length]);

  // 4. Pan to the card-selection (card → marker sync).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const hit = points.find((p) => String(p.id) === String(selectedId));
    if (hit) {
      programmaticRef.current = true;
      map.panTo([hit.lat, hit.lng]);
      setTimeout(() => { programmaticRef.current = false; }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 5. Render markers with grid clustering; re-run on data, zoom, selection.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return undefined;

    const render = () => {
      layer.clearLayers();
      const zoom = map.getZoom();
      const cells = new Map();
      for (const p of points) {
        const pt = map.project([p.lat, p.lng], zoom);
        const key = `${Math.floor(pt.x / GRID_PX)}:${Math.floor(pt.y / GRID_PX)}`;
        const cell = cells.get(key);
        if (cell) cell.items.push(p);
        else cells.set(key, { items: [p] });
      }
      for (const { items } of cells.values()) {
        if (items.length === 1) {
          const p = items[0];
          const selected = String(p.id) === String(selectedId);
          L.marker([p.lat, p.lng], { icon: priceBadgeIcon(p.priceLabel, selected) })
            .on('click', () => onSelectRef.current(p.id))
            .addTo(layer);
        } else {
          const lat = items.reduce((s, p) => s + p.lat, 0) / items.length;
          const lng = items.reduce((s, p) => s + p.lng, 0) / items.length;
          L.marker([lat, lng], { icon: clusterBadgeIcon(items.length) })
            .on('click', () => {
              programmaticRef.current = true;
              map.setView([lat, lng], Math.min(zoom + 2, 18));
              setTimeout(() => { programmaticRef.current = false; }, 300);
            })
            .addTo(layer);
        }
      }
    };

    render();
    map.on('zoomend', render);
    map.on('moveend', render);
    return () => {
      map.off('zoomend', render);
      map.off('moveend', render);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, selectedId, mapError]);

  if (mapError) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center">
        <MapPinOff className="h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-500">Map unavailable. Please check your connection.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Property results map"
      className="h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-gray-200"
    />
  );
};

export default MapResults;
