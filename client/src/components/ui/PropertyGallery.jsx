import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Building } from 'lucide-react';

const PropertyGallery = ({
  images = [],
  title = 'Property',
  className = '',
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});

  const validImages = Array.isArray(images) ? images : [];
  const total = validImages.length;

  const handleImageError = (index) => {
    setFailedImages((prev) => {
      if (prev[index]) return prev;
      return { ...prev, [index]: true };
    });
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (activeIndex < total - 1) {
      setActiveIndex((prev) => prev + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (total <= 1) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(total - 1);
    }
  };

  // Check if all images failed to load
  const allImagesFailed = total > 0 && Object.keys(failedImages).length === total;

  // 1. Zero images or all images failed
  if (total === 0 || allImagesFailed) {
    return (
      <div
        className={`relative flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-100 p-8 text-center text-gray-500 ${className}`}
        role="region"
        aria-label={`${title} photos`}
      >
        <div className="mb-3 rounded-full bg-gray-200/80 p-4 text-gray-400">
          <Building className="h-10 w-10" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-600">No photos available for this listing</p>
      </div>
    );
  }

  // 2. Single image
  if (total === 1) {
    const isFailed = Boolean(failedImages[0]);
    return (
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm ${className}`}
        role="region"
        aria-label={`${title} photos`}
      >
        {isFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500">
            <ImageOff className="mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="text-sm font-medium">Photo unavailable</p>
          </div>
        ) : (
          <img
            src={validImages[0]}
            alt={`${title} — photo 1 of 1`}
            onError={() => handleImageError(0)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    );
  }

  // 3. Multiple images
  const currentImage = validImages[activeIndex];
  const isCurrentFailed = Boolean(failedImages[activeIndex]);

  return (
    <div
      className={`space-y-3 ${className}`}
      role="region"
      aria-label={`${title} photo gallery`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Main Active Photo Viewport */}
      <div className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
        {isCurrentFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500">
            <ImageOff className="mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="text-sm font-medium">Photo unavailable</p>
          </div>
        ) : (
          <img
            src={currentImage}
            alt={`${title} — photo ${activeIndex + 1} of ${total}`}
            onError={() => handleImageError(activeIndex)}
            className="h-full w-full object-cover transition-all duration-200"
          />
        )}

        {/* Previous Button */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={activeIndex === 0}
          aria-label="Previous photo"
          className="absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-xs transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/90"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* Next Button */}
        <button
          type="button"
          onClick={handleNext}
          disabled={activeIndex === total - 1}
          aria-label="Next photo"
          className="absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-xs transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/90"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>

        {/* Counter Badge */}
        <div
          className="absolute right-4 bottom-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tracking-wider text-white backdrop-blur-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          {activeIndex + 1} / {total}
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div
        className="flex gap-3 overflow-x-auto pb-1 pt-0.5 focus:outline-none"
        aria-label="Photo thumbnails"
      >
        {validImages.map((img, idx) => {
          const isActive = idx === activeIndex;
          const isThumbFailed = Boolean(failedImages[idx]);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`Show photo ${idx + 1} of ${total}`}
              aria-current={isActive ? 'true' : undefined}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border bg-gray-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:h-18 sm:w-28 ${
                isActive
                  ? 'border-indigo-600 ring-2 ring-indigo-600 ring-offset-1'
                  : 'border-gray-200 opacity-70 hover:opacity-100'
              }`}
            >
              {isThumbFailed ? (
                <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                  <ImageOff className="h-4 w-4" aria-hidden="true" />
                </div>
              ) : (
                <img
                  src={img}
                  alt=""
                  aria-hidden="true"
                  onError={() => handleImageError(idx)}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PropertyGallery;
