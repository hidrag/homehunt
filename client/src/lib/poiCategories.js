/**
 * S12 (ADR-034): shared POI category presentation constants.
 *
 * Lives in lib/ (not the component files) so PropertyMap and
 * NeighborhoodSection import identical tints/labels without either module
 * exporting non-component values (oxlint react/only-export-components).
 */
export const POI_COLORS = {
  transit: '#0ea5e9',
  school: '#8b5cf6',
  grocery: '#f59e0b',
  healthcare: '#ef4444',
  park: '#22c55e',
};

export const POI_CATEGORY_LABELS = {
  transit: 'Transit',
  school: 'Schools',
  grocery: 'Grocery',
  healthcare: 'Healthcare',
  park: 'Parks',
};

export const POI_CATEGORY_ORDER = ['transit', 'school', 'grocery', 'healthcare', 'park'];
