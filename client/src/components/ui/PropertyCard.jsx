import React from 'react';
import { MapPin, Bed, Bath, Square } from 'lucide-react';
import { Link } from 'react-router-dom';

const PropertyCard = ({ property }) => {
  const [imageError, setImageError] = React.useState(false);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <Link
      to={`/listings/${property._id}`}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {property.images && property.images.length > 0 && !imageError ? (
          <img
            src={property.images[0]}
            alt={property.title}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            No Image Available
          </div>
        )}
        <div className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tracking-wider text-gray-900 shadow-sm backdrop-blur-sm uppercase">
          {property.listingType}
        </div>
        <div className="absolute top-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tracking-wider text-white backdrop-blur-sm uppercase">
          {property.status.replace("_", " ")}
        </div>
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xl font-bold text-gray-900">
            {formatPrice(property.price)}
          </p>
          <p className="text-sm font-medium text-gray-500 capitalize">
            {property.propertyType}
          </p>
        </div>

        <h3
          className="mb-2 truncate text-lg font-semibold text-gray-800"
          title={property.title}
        >
          {property.title}
        </h3>

        <div className="mb-4 flex items-center text-sm text-gray-500">
          <MapPin className="mr-1 h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate">
            {property.address.city}, {property.address.state}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
          <div className="flex items-center gap-1.5" title="Bedrooms">
            <Bed className="h-4 w-4 text-gray-400" />
            <span>{property.bedrooms || "-"}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Bathrooms">
            <Bath className="h-4 w-4 text-gray-400" />
            <span>{property.bathrooms || "-"}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Area">
            <Square className="h-4 w-4 text-gray-400" />
            <span>{property.area ? `${property.area} sqft` : "-"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default PropertyCard;
