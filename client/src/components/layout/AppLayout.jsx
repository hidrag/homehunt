import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import CompareTray from './CompareTray';
import useOnlineStatus from '../../hooks/useOnlineStatus';

const AppLayout = () => {
  const online = useOnlineStatus();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {/* S15 — offline banner (ADR-039): shown while the browser reports no
          connection. Cached browsing continues; mutations fail visibly. */}
      {!online && (
        <div
          role="status"
          className="min-h-11 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900"
        >
          You&apos;re offline — browsing cached content. Some pages may be outdated or unavailable.
        </div>
      )}
      <main className="flex-1 bg-gray-50">
        <Outlet />
      </main>
      <Footer />
      <CompareTray />
    </div>
  );
};

export default AppLayout;
