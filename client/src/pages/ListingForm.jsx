import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AlertCircle, ArrowLeft, Trash2, Upload } from 'lucide-react';
import propertyApi from '../services/propertyApi';

const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'condo', 'land'];
const LISTING_TYPES = ['sale', 'rent'];
const PROPERTY_STATUSES = ['available', 'under_offer', 'sold', 'rented'];
const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp';
const IMAGE_MAX_PER_REQUEST = 5;

/**
 * Splits a textarea/input value into a clean list (newline or comma separated).
 */
const splitList = (value) =>
  value
    ? value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/**
 * Maps empty or invalid numeric input to undefined so optional numbers can be skipped.
 */
const emptyToUndefined = (value, original) => {
  if (
    original === '' ||
    original === null ||
    original === undefined ||
    Number.isNaN(original) ||
    Number.isNaN(value)
  ) {
    return undefined;
  }
  return value;
};

const requiredNumber = (label) =>
  yup
    .number()
    .transform(emptyToUndefined)
    .typeError(`${label} must be a number`)
    .required(`${label} is required`);

const optionalNonNegativeNumber = (label) =>
  yup
    .number()
    .transform(emptyToUndefined)
    .typeError(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .notRequired();

const listingSchema = yup.object({
  title: yup
    .string()
    .trim()
    .required('Title is required')
    .max(200, 'Title cannot exceed 200 characters'),
  description: yup
    .string()
    .trim()
    .required('Description is required')
    .max(5000, 'Description cannot exceed 5000 characters'),
  price: requiredNumber('Price').min(0, 'Price cannot be negative'),
  propertyType: yup
    .string()
    .oneOf(PROPERTY_TYPES, 'Select a valid property type')
    .required('Property type is required'),
  listingType: yup
    .string()
    .oneOf(LISTING_TYPES, 'Select a valid listing type')
    .required('Listing type is required'),
  status: yup
    .string()
    .oneOf(PROPERTY_STATUSES, 'Select a valid status')
    .required('Status is required')
    .default('available'),
  street: yup
    .string()
    .trim()
    .required('Street is required')
    .max(200, 'Street cannot exceed 200 characters'),
  city: yup
    .string()
    .trim()
    .required('City is required')
    .max(100, 'City cannot exceed 100 characters'),
  state: yup
    .string()
    .trim()
    .required('State is required')
    .max(100, 'State cannot exceed 100 characters'),
  zipCode: yup
    .string()
    .trim()
    .required('Zip code is required')
    .max(20, 'Zip code cannot exceed 20 characters'),
  country: yup
    .string()
    .trim()
    .required('Country is required')
    .max(100, 'Country cannot exceed 100 characters')
    .default('India'),
  latitude: requiredNumber('Latitude')
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: requiredNumber('Longitude')
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  bedrooms: optionalNonNegativeNumber('Bedrooms'),
  bathrooms: optionalNonNegativeNumber('Bathrooms'),
  area: optionalNonNegativeNumber('Area'),
  amenities: yup.string(),
  images: yup
    .string()
    .test('image-urls', 'Each image must be a valid http(s) URL', (value) =>
      splitList(value).every((url) => IMAGE_URL_PATTERN.test(url)),
    ),
  // S13: server normalizes share URLs to canonical embed URLs; the client
  // only requires a syntactically valid URL here (whitelist enforced by the
  // server on save and re-checked before any iframe renders).
  virtualTourUrl: yup
    .string()
    .trim()
    .test(
      'tour-url',
      'Enter a valid https URL (YouTube, Vimeo, Matterport or Kuula)',
      (value) => !value || IMAGE_URL_PATTERN.test(value.trim()),
    )
    .max(500, 'URL cannot exceed 500 characters')
    .notRequired(),
});

const inputClass = (hasError) =>
  `block w-full rounded-lg border px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none sm:text-sm ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500'
      : 'border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
  }`;

const labelClass = 'block text-sm font-medium text-gray-700';

const ListingForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = location.state?.fromAdmin || '/agent';
  const { user } = useSelector((state) => state.auth);

  const [formLoading, setFormLoading] = useState(isEdit);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // S13 — verified photo manager (uploads need a saved property, edit only).
  const [savedImages, setSavedImages] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadNotice, setUploadNotice] = useState(null);
  const fileInputRef = useRef(null);

  const loadSavedImages = useCallback(async () => {
    if (!isEdit) return;
    try {
      const result = await propertyApi.getImages(id);
      setSavedImages(result?.data?.images || []);
    } catch (err) {
      // Owner-scoped endpoint; failures are surfaced in the panel only.
      console.error('Failed to load listing photos:', err);
    }
  }, [id, isEdit]);

  useEffect(() => {
    loadSavedImages();
  }, [loadSavedImages]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(listingSchema),
    mode: 'onBlur',
    defaultValues: {
      title: '',
      description: '',
      propertyType: 'apartment',
      listingType: 'sale',
      status: 'available',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'India',
      amenities: '',
      images: '',
      virtualTourUrl: '',
    },
  });

  useEffect(() => {
    if (!isEdit) {
      setFormLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchProperty = async () => {
      try {
        setFormLoading(true);
        setFormError(null);

        const result = await propertyApi.getPropertyById(id, { signal: controller.signal });
        const property = result?.data?.property;

        if (!property) {
          setFormError('Failed to load the listing. It may have been removed.');
          return;
        }

        if (user?.role !== 'admin' && property.agent !== user?.id) {
          setFormError('You can only edit your own listings.');
          return;
        }

        reset({
          title: property.title || '',
          description: property.description || '',
          price: property.price,
          propertyType: property.propertyType,
          listingType: property.listingType,
          status: property.status || 'available',
          street: property.address?.street || '',
          city: property.address?.city || '',
          state: property.address?.state || '',
          zipCode: property.address?.zipCode || '',
          country: property.address?.country || 'India',
          latitude: property.location?.coordinates?.[1],
          longitude: property.location?.coordinates?.[0],
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          area: property.area,
          amenities: (property.amenities || []).join(', '),
          images: (property.images || []).join('\n'),
          virtualTourUrl: property.virtualTourUrl || '',
        });
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Failed to load listing:', err);
        setFormError('Failed to load the listing. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setFormLoading(false);
        }
      }
    };

    fetchProperty();

    return () => {
      controller.abort();
    };
  }, [id, isEdit, reset, user]);

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);
      setSubmitError(null);

      const payload = {
        title: data.title,
        description: data.description,
        price: data.price,
        propertyType: data.propertyType,
        listingType: data.listingType,
        location: { type: 'Point', coordinates: [data.longitude, data.latitude] },
        address: {
          street: data.street,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
        },
        amenities: splitList(data.amenities),
        images: splitList(data.images),
      };

      if (data.bedrooms !== undefined) payload.bedrooms = data.bedrooms;
      if (data.bathrooms !== undefined) payload.bathrooms = data.bathrooms;
      if (data.area !== undefined) payload.area = data.area;
      const tour = (data.virtualTourUrl || '').trim();
      // Only send the field when it changes (null clears server-side).
      if (tour) payload.virtualTourUrl = tour;
      else if (!isEdit) payload.virtualTourUrl = null;

      if (isEdit) {
        payload.status = data.status;
        await propertyApi.updateProperty(id, payload);
      } else {
        await propertyApi.createProperty(payload);
      }

      navigate(returnPath);
    } catch (err) {
      console.error('Failed to save listing:', err);
      setSubmitError(
        err.response?.data?.error?.message || 'Failed to save the listing. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * S13 — upload selected files as verified photos (server sniffs bytes,
   * enforces type/size/20-cap, and appends the normalized entries).
   */
  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploadBusy(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const result = await propertyApi.uploadImages(id, files);
      setSavedImages(result?.data?.images || []);
      setUploadNotice(`Uploaded ${files.length} photo${files.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setUploadError(err.response?.data?.error?.message || 'Upload failed. Please try again.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handlePhotoRemove = async (imageId) => {
    setUploadBusy(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      await propertyApi.deleteImage(id, imageId);
      setSavedImages((prev) => prev.filter((img) => img.imageId !== imageId));
    } catch (err) {
      setUploadError(err.response?.data?.error?.message || 'Could not remove the photo.');
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          to={returnPath}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
          {isEdit ? 'Edit Listing' : 'Create Listing'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isEdit
            ? 'Update the details of your listing.'
            : 'Publish a new property listing. You can edit it at any time.'}
        </p>
      </div>

      {formLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
        </div>
      ) : formError ? (
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h3 className="text-sm font-medium text-red-800">{formError}</h3>
          <Link
            to={returnPath}
            className="mt-4 inline-flex items-center rounded bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
          {submitError && (
            <div
              className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <span>{submitError}</span>
            </div>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Listing Details</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className={labelClass}>
                  Title
                </label>
                <div className="mt-1">
                  <input
                    id="title"
                    type="text"
                    {...register('title')}
                    className={inputClass(errors.title)}
                    placeholder="e.g. Spacious 3BHK Apartment in Bandra"
                  />
                  {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="description" className={labelClass}>
                  Description
                </label>
                <div className="mt-1">
                  <textarea
                    id="description"
                    rows={4}
                    {...register('description')}
                    className={inputClass(errors.description)}
                    placeholder="Describe the property, its highlights, and the neighborhood."
                  />
                  {errors.description && (
                    <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="price" className={labelClass}>
                    Price (INR)
                  </label>
                  <div className="mt-1">
                    <input
                      id="price"
                      type="number"
                      step="any"
                      min="0"
                      {...register('price', { valueAsNumber: true })}
                      className={inputClass(errors.price)}
                      placeholder="e.g. 8500000"
                    />
                    {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="propertyType" className={labelClass}>
                    Property Type
                  </label>
                  <div className="mt-1">
                    <select
                      id="propertyType"
                      {...register('propertyType')}
                      className={inputClass(errors.propertyType)}
                    >
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                    {errors.propertyType && (
                      <p className="mt-1 text-xs text-red-600">{errors.propertyType.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="listingType" className={labelClass}>
                    Listing Type
                  </label>
                  <div className="mt-1">
                    <select
                      id="listingType"
                      {...register('listingType')}
                      className={inputClass(errors.listingType)}
                    >
                      {LISTING_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type === 'sale' ? 'For Sale' : 'For Rent'}
                        </option>
                      ))}
                    </select>
                    {errors.listingType && (
                      <p className="mt-1 text-xs text-red-600">{errors.listingType.message}</p>
                    )}
                  </div>
                </div>

                {isEdit && (
                  <div>
                    <label htmlFor="status" className={labelClass}>
                      Status
                    </label>
                    <div className="mt-1">
                      <select id="status" {...register('status')} className={inputClass(errors.status)}>
                        {PROPERTY_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status === 'under_offer'
                              ? 'Under Offer'
                              : status.charAt(0).toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                      {errors.status && (
                        <p className="mt-1 text-xs text-red-600">{errors.status.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Location &amp; Address</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="street" className={labelClass}>
                  Street
                </label>
                <div className="mt-1">
                  <input
                    id="street"
                    type="text"
                    {...register('street')}
                    className={inputClass(errors.street)}
                    placeholder="e.g. 14 Carter Road"
                  />
                  {errors.street && <p className="mt-1 text-xs text-red-600">{errors.street.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="city" className={labelClass}>
                    City
                  </label>
                  <div className="mt-1">
                    <input
                      id="city"
                      type="text"
                      {...register('city')}
                      className={inputClass(errors.city)}
                      placeholder="e.g. Mumbai"
                    />
                    {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="state" className={labelClass}>
                    State
                  </label>
                  <div className="mt-1">
                    <input
                      id="state"
                      type="text"
                      {...register('state')}
                      className={inputClass(errors.state)}
                      placeholder="e.g. Maharashtra"
                    />
                    {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state.message}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="zipCode" className={labelClass}>
                    Zip Code
                  </label>
                  <div className="mt-1">
                    <input
                      id="zipCode"
                      type="text"
                      {...register('zipCode')}
                      className={inputClass(errors.zipCode)}
                      placeholder="e.g. 400050"
                    />
                    {errors.zipCode && (
                      <p className="mt-1 text-xs text-red-600">{errors.zipCode.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="country" className={labelClass}>
                    Country
                  </label>
                  <div className="mt-1">
                    <input
                      id="country"
                      type="text"
                      {...register('country')}
                      className={inputClass(errors.country)}
                      placeholder="e.g. India"
                    />
                    {errors.country && (
                      <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="latitude" className={labelClass}>
                    Latitude
                  </label>
                  <div className="mt-1">
                    <input
                      id="latitude"
                      type="number"
                      step="any"
                      {...register('latitude', { valueAsNumber: true })}
                      className={inputClass(errors.latitude)}
                      placeholder="e.g. 19.0596"
                    />
                    {errors.latitude && (
                      <p className="mt-1 text-xs text-red-600">{errors.latitude.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="longitude" className={labelClass}>
                    Longitude
                  </label>
                  <div className="mt-1">
                    <input
                      id="longitude"
                      type="number"
                      step="any"
                      {...register('longitude', { valueAsNumber: true })}
                      className={inputClass(errors.longitude)}
                      placeholder="e.g. 72.8296"
                    />
                    {errors.longitude && (
                      <p className="mt-1 text-xs text-red-600">{errors.longitude.message}</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Coordinates are stored as GeoJSON [longitude, latitude] per the database contract.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Property Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="bedrooms" className={labelClass}>
                  Bedrooms
                </label>
                <div className="mt-1">
                  <input
                    id="bedrooms"
                    type="number"
                    step="any"
                    min="0"
                    {...register('bedrooms', { valueAsNumber: true })}
                    className={inputClass(errors.bedrooms)}
                    placeholder="e.g. 3"
                  />
                  {errors.bedrooms && (
                    <p className="mt-1 text-xs text-red-600">{errors.bedrooms.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="bathrooms" className={labelClass}>
                  Bathrooms
                </label>
                <div className="mt-1">
                  <input
                    id="bathrooms"
                    type="number"
                    step="any"
                    min="0"
                    {...register('bathrooms', { valueAsNumber: true })}
                    className={inputClass(errors.bathrooms)}
                    placeholder="e.g. 2"
                  />
                  {errors.bathrooms && (
                    <p className="mt-1 text-xs text-red-600">{errors.bathrooms.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="area" className={labelClass}>
                  Area (sqft)
                </label>
                <div className="mt-1">
                  <input
                    id="area"
                    type="number"
                    step="any"
                    min="0"
                    {...register('area', { valueAsNumber: true })}
                    className={inputClass(errors.area)}
                    placeholder="e.g. 1450"
                  />
                  {errors.area && <p className="mt-1 text-xs text-red-600">{errors.area.message}</p>}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Media &amp; Amenities</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="images" className={labelClass}>
                  Image URLs
                </label>
                <div className="mt-1">
                  <textarea
                    id="images"
                    rows={4}
                    {...register('images')}
                    className={inputClass(errors.images)}
                    placeholder={'https://images.example.com/photo-1.jpg\nhttps://images.example.com/photo-2.jpg'}
                  />
                  {errors.images && <p className="mt-1 text-xs text-red-600">{errors.images.message}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    One https:// image URL per line{isEdit ? ', or upload verified photos below' : ''}. Max 20 images per listing.
                  </p>
                </div>
              </div>

              {/* S13 — verified photo uploads (edit mode: needs a saved listing) */}
              {isEdit && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Verified photo uploads</h3>
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{uploadBusy ? 'Uploading…' : 'Upload photos'}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        accept={IMAGE_ACCEPT}
                        multiple
                        disabled={uploadBusy}
                        onChange={handlePhotoUpload}
                        aria-label="Upload listing photos"
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    JPEG, PNG or WebP · max {IMAGE_MAX_PER_REQUEST} per upload · 5 MB each · stored on the media provider.
                  </p>
                  {uploadError && (
                    <p role="alert" className="mt-2 text-xs text-red-700">{uploadError}</p>
                  )}
                  {uploadNotice && (
                    <p role="status" className="mt-2 text-xs text-green-700">{uploadNotice}</p>
                  )}
                  {savedImages.length > 0 ? (
                    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {savedImages.map((img) => (
                        <li key={img.imageId} className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <img src={img.url} alt={img.alt || 'Listing photo'} className="aspect-square w-full object-cover" />
                          <button
                            type="button"
                            disabled={uploadBusy}
                            onClick={() => handlePhotoRemove(img.imageId)}
                            className="absolute right-1 top-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-md bg-white/90 p-1.5 text-red-600 shadow hover:bg-white disabled:opacity-50"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500">No uploaded photos yet.</p>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="virtualTourUrl" className={labelClass}>
                  Virtual tour URL
                </label>
                <div className="mt-1">
                  <input
                    id="virtualTourUrl"
                    type="url"
                    {...register('virtualTourUrl')}
                    className={inputClass(errors.virtualTourUrl)}
                    placeholder="https://www.youtube.com/watch?v=…, https://vimeo.com/…, https://player.media.matterport.com/embed/… or a Kuula player link"
                  />
                  {errors.virtualTourUrl && (
                    <p className="mt-1 text-xs text-red-600">{errors.virtualTourUrl.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    YouTube, Vimeo, Matterport or Kuula share links. Saved formats are normalized to the provider embed URL.
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="amenities" className={labelClass}>
                  Amenities
                </label>
                <div className="mt-1">
                  <input
                    id="amenities"
                    type="text"
                    {...register('amenities')}
                    className={inputClass(errors.amenities)}
                    placeholder="e.g. Parking, Lift, Gym, Security"
                  />
                  {errors.amenities && (
                    <p className="mt-1 text-xs text-red-600">{errors.amenities.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">Separate amenities with commas.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              to={returnPath}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </span>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Listing'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ListingForm;
