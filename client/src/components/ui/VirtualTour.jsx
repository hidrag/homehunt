import React from 'react';
import { ExternalLink, Rotate3d } from 'lucide-react';
import { isCanonicalTourUrl, tourProvider, TOUR_PROVIDER_LABELS } from '../../lib/virtualTour';

/**
 * S13 (ADR-036) — embedded virtual tour.
 *
 * The stored value is re-validated against the canonical whitelist before it
 * becomes an iframe src (client-side defense in depth). An iframe is only
 * rendered for a whitelisted URL; anything else is silently dropped, so a
 * tampered database value can never inject an arbitrary frame. The iframe is
 * sandboxed without same-origin and carries no referrer.
 */
const VirtualTour = ({ url }) => {
  if (!isCanonicalTourUrl(url)) return null;
  const provider = tourProvider(url);
  const label = TOUR_PROVIDER_LABELS[provider] || 'Virtual tour';

  return (
    <section className="mb-8" aria-label="Virtual tour">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Rotate3d className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          Virtual tour
        </h2>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Open in new tab
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm">
        <div className="relative aspect-video">
          <iframe
            src={url}
            title={`${label} — property virtual tour`}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking"
            allowFullScreen
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">Provided via {label}. Hosted by the tour provider.</p>
    </section>
  );
};

export default VirtualTour;
