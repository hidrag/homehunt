import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-center mb-8">Welcome to HomeHunt</h1>
      <p className="text-center text-lg text-gray-600 mb-8">
        Find your perfect home today.
      </p>
      <div className="flex justify-center">
        <Link 
          to="/listings"
          className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          Browse Listings
        </Link>
      </div>
    </div>
  );
};

export default Home;
