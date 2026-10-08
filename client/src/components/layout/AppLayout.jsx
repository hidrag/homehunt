import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import CompareTray from './CompareTray';

const AppLayout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-gray-50">
        <Outlet />
      </main>
      <Footer />
      <CompareTray />
    </div>
  );
};

export default AppLayout;
