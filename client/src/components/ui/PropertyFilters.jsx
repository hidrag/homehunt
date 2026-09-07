import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import SearchInput from './SearchInput';
import SelectFilter from './SelectFilter';
import DebouncedInput from './DebouncedInput';

const PROPERTY_TYPES = [
  { label: 'Apartment', value: 'apartment' },
  { label: 'House', value: 'house' },
  { label: 'Villa', value: 'villa' },
  { label: 'Condo', value: 'condo' },
  { label: 'Land', value: 'land' },
];

const LISTING_TYPES = [
  { label: 'For Sale', value: 'sale' },
  { label: 'For Rent', value: 'rent' },
];

const BEDROOM_OPTIONS = [
  { label: '1+ BHK / Bed', value: '1' },
  { label: '2+ BHK / Beds', value: '2' },
  { label: '3+ BHK / Beds', value: '3' },
  { label: '4+ BHK / Beds', value: '4' },
];

const SORT_OPTIONS = [
  { label: 'Newest Listed', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
];

const PropertyFilters = ({
  filters,
  onFilterChange,
  onClearFilters,
  isFiltered,
  className = '',
}) => {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {/* Top Bar: Search Input & Mobile Toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <SearchInput
            id="filter-search-input"
            value={filters.q}
            onChange={(val) => onFilterChange('q', val)}
            placeholder="Search by title, description or city..."
          />
        </div>

        <div className="flex items-center justify-between gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <SlidersHorizontal className="h-4 w-4 text-gray-500" />
            <span>Filters {isFiltered ? '•' : ''}</span>
            {mobileExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {isFiltered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Options Grid: Visible always on Desktop (lg), toggleable on Mobile */}
      <div className={`mt-4 border-t border-gray-100 pt-4 ${mobileExpanded ? 'block' : 'hidden lg:block'}`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* City Filter */}
          <div>
            <label htmlFor="filter-city" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-700">
              City
            </label>
            <DebouncedInput
              id="filter-city"
              type="text"
              value={filters.city}
              onChange={(val) => onFilterChange('city', val)}
              placeholder="e.g. Mumbai, Goa"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Property Type */}
          <SelectFilter
            id="filter-property-type"
            label="Property Type"
            value={filters.type}
            onChange={(val) => onFilterChange('type', val)}
            options={PROPERTY_TYPES}
            placeholder="All Types"
          />

          {/* Listing Type */}
          <SelectFilter
            id="filter-listing-type"
            label="Listing Type"
            value={filters.listing}
            onChange={(val) => onFilterChange('listing', val)}
            options={LISTING_TYPES}
            placeholder="All Listings"
          />

          {/* Min Price */}
          <div>
            <label htmlFor="filter-min-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-700">
              Min Price (₹)
            </label>
            <DebouncedInput
              id="filter-min-price"
              type="number"
              min="0"
              value={filters.minPrice}
              onChange={(val) => onFilterChange('minPrice', val)}
              placeholder="Min ₹"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Max Price */}
          <div>
            <label htmlFor="filter-max-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-700">
              Max Price (₹)
            </label>
            <DebouncedInput
              id="filter-max-price"
              type="number"
              min="0"
              value={filters.maxPrice}
              onChange={(val) => onFilterChange('maxPrice', val)}
              placeholder="Max ₹"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Bedrooms */}
          <SelectFilter
            id="filter-bedrooms"
            label="Bedrooms"
            value={filters.beds}
            onChange={(val) => onFilterChange('beds', val)}
            options={BEDROOM_OPTIONS}
            placeholder="Any BHK"
          />
        </div>

        {/* Bottom Bar: Sort and Clear Action */}
        <div className="mt-4 flex flex-col items-start justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="filter-sort" className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              Sort By:
            </label>
            <select
              id="filter-sort"
              value={filters.sort || 'newest'}
              onChange={(e) => onFilterChange('sort', e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="hidden items-center gap-1.5 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 lg:inline-flex"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear all filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyFilters;
