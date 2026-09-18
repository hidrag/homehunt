import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Bed, Bath, Square, ArrowLeft, Building, ShieldCheck } from 'lucide-react';
import propertyApi from '../services/propertyApi';
import PropertyGallery from "../components/ui/PropertyGallery";
import PropertyMap from "../components/ui/PropertyMap";
import BookmarkButton from "../components/ui/BookmarkButton";
import InquiryForm from "../components/ui/InquiryForm";

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProperty = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await propertyApi.getPropertyById(id);

        if (result.success) {
          setProperty(result.data.property);
        }
      } catch (err) {
        console.error('Failed to fetch property details:', err);
        if (err.response?.status === 404 || err.response?.status === 400) {
          setError('Property not found.');
        } else {
          setError('Failed to load property details. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [id]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <Building className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{error || 'Property not found'}</h2>
        <p className="mt-2 text-gray-500">
          The listing you are looking for might have been removed or is temporarily unavailable.
        </p>
        <button
          onClick={() => navigate('/listings')}
          className="mt-6 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Listings
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 1. Navigation */}
      <nav className="mb-6 flex items-center text-sm font-medium text-gray-500">
        <Link
          to="/listings"
          className="flex items-center hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to listings
        </Link>
      </nav>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Details, Gallery, Sections */}
        <div className="lg:col-span-2">
          {/* 2. Property Header section */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold tracking-wider text-indigo-800 uppercase">
                {property.listingType}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wider uppercase ${
                  property.status === "available"
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {property.status.replace("_", " ")}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {property.title}
            </h1>
            <div className="mt-3 flex items-center text-lg text-gray-600">
              <MapPin className="mr-2 h-5 w-5 shrink-0 text-gray-400" />
              <span>
                {property.address.street}, {property.address.city},{" "}
                {property.address.state} {property.address.zipCode},{" "}
                {property.address.country}
              </span>
            </div>
          </div>

          {/* 3. Property Gallery */}
          <div className="mb-8">
            <PropertyGallery
              key={property._id}
              images={property.images}
              title={property.title}
            />
          </div>

          {/* 4. Property Highlights */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Property Highlights
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Property Type</span>
                <span className="font-medium text-gray-900 capitalize">
                  {property.propertyType}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Bedrooms</span>
                <div className="flex items-center font-medium text-gray-900">
                  <Bed className="mr-1.5 h-4 w-4 text-gray-400" />
                  {property.bedrooms ?? "N/A"}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Bathrooms</span>
                <div className="flex items-center font-medium text-gray-900">
                  <Bath className="mr-1.5 h-4 w-4 text-gray-400" />
                  {property.bathrooms ?? "N/A"}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Area</span>
                <div className="flex items-center font-medium text-gray-900">
                  <Square className="mr-1.5 h-4 w-4 text-gray-400" />
                  {property.area ? `${property.area} sqft` : "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* 5. About this property */}
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              About this property
            </h2>
            <div className="prose max-w-none text-gray-600">
              <p className="whitespace-pre-line leading-relaxed">
                {property.description}
              </p>
            </div>
          </div>

          {/* 6. Amenities */}
          {property.amenities && property.amenities.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                Amenities
              </h2>
              <ul className="grid grid-cols-2 gap-y-3 gap-x-4 sm:grid-cols-3">
                {property.amenities.map((amenity, index) => (
                  <li key={index} className="flex items-center text-gray-600">
                    <ShieldCheck className="mr-2 h-4 w-4 shrink-0 text-indigo-500" />
                    <span>{amenity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 7. Location Map */}
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Location
            </h2>
            <PropertyMap location={property.location} title={property.title} />
          </div>
        </div>

        {/* Right Sidebar - Pricing & Overview Details */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-3xl font-bold text-indigo-700">
              {formatPrice(property.price)}
            </p>
            <p className="mb-4 text-sm text-gray-500">
              {property.listingType === "rent" ? "Per Month" : "Listed Price"}
            </p>

            <div className="mb-6">
              <BookmarkButton propertyId={property._id} className="shadow-sm" />
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium text-gray-900 capitalize">
                  {property.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Listing Type</span>
                <span className="font-medium text-gray-900 capitalize">
                  {property.listingType}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Property Type</span>
                <span className="font-medium text-gray-900 capitalize">
                  {property.propertyType}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Listed on</span>
                <span className="font-medium text-gray-900">
                  {new Date(property.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            </div>

            <InquiryForm propertyId={property._id} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingDetail;
