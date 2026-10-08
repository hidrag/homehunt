import React from 'react';

/**
 * S15 (ADR-040) — shared Suspense fallback for lazily-loaded routes.
 */
const PageSpinner = () => (
  <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
    <span
      className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
      aria-hidden="true"
    />
  </div>
);

export default PageSpinner;
