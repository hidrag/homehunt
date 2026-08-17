import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-primary">
          HomeHunt
        </Link>
        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/listings" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Listings
          </Link>
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
