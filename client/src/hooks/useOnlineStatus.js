import { useEffect, useState } from 'react';

/**
 * S15 — live connectivity state. `navigator.onLine` hydrated at mount,
 * kept current via the browser online/offline events.
 */
export const useOnlineStatus = () => {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
};

export default useOnlineStatus;
