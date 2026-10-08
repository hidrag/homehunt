/**
 * S14 (ADR-038) — comparison selection store.
 *
 * Deliberately NOT redux: comparison is ephemeral per-device shopping
 * state (locked decision: localStorage tray, not server-synced). This is a
 * tiny external store (useSyncExternalStore) so PropertyCard, the tray,
 * and /compare all observe one source of truth. Cross-tab sync via the
 * `storage` event. Cap 4 — adding a 5th silently evicts the oldest.
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'homehunt.compareIds';
export const COMPARE_MAX = 4;

const listeners = new Set();

const readIds = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
};

let ids = readIds();

const persist = (next) => {
  ids = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / quota — selection stays in-memory for this tab */
  }
  listeners.forEach((fn) => fn());
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      ids = readIds();
      listeners.forEach((fn) => fn());
    }
  });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const toggleCompare = (id) => {
  const current = readIds();
  if (current.includes(id)) {
    persist(current.filter((x) => x !== id));
    return;
  }
  const next = [...current, id];
  persist(next.length > COMPARE_MAX ? next.slice(next.length - COMPARE_MAX) : next);
};

export const removeCompare = (id) => persist(readIds().filter((x) => x !== id));
export const clearCompare = () => persist([]);

export const useCompareIds = () => useSyncExternalStore(subscribe, () => ids, () => ids);
