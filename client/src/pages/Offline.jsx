import React from 'react';
import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';

/**
 * S15 — offline fallback page. The precached app shell serves navigations
 * while the network is down; routes with no cached data land here instead
 * of a blank page or a browser error screen.
 */
const Offline = () => (
  <div className="mx-auto max-w-md px-4 py-16 text-center">
    <WifiOff className="mx-auto mb-4 h-10 w-10 text-gray-300" aria-hidden="true" />
    <h1 className="mb-2 text-2xl font-semibold text-gray-900">You&apos;re offline</h1>
    <p className="mb-6 text-gray-500">
      Some pages you visited recently are still readable from this device. We&apos;ll reconnect
      automatically when you&apos;re back online.
    </p>
    <Link
      to="/"
      className="inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >
      Go to Home
    </Link>
  </div>
);

export default Offline;
