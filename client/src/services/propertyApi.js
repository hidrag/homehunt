import api from '../lib/axios';

/**
 * Maps frontend query parameters to backend API parameters
 * @param {Object} frontendParams
 * @returns {Object} backendParams
 */
export const mapFrontendToBackendParams = (frontendParams = {}) => {
  const backendParams = {};

  if (frontendParams.q !== undefined && frontendParams.q !== '') {
    backendParams.search = frontendParams.q;
  }
  if (frontendParams.city !== undefined && frontendParams.city !== '') {
    backendParams.city = frontendParams.city;
  }
  if (frontendParams.type !== undefined && frontendParams.type !== '') {
    backendParams.propertyType = frontendParams.type;
  }
  if (frontendParams.listing !== undefined && frontendParams.listing !== '') {
    backendParams.listingType = frontendParams.listing;
  }
  if (frontendParams.minPrice !== undefined && frontendParams.minPrice !== '') {
    backendParams.minPrice = frontendParams.minPrice;
  }
  if (frontendParams.maxPrice !== undefined && frontendParams.maxPrice !== '') {
    backendParams.maxPrice = frontendParams.maxPrice;
  }
  if (frontendParams.beds !== undefined && frontendParams.beds !== '') {
    backendParams.bedrooms = frontendParams.beds;
  }
  if (frontendParams.sort !== undefined && frontendParams.sort !== '') {
    backendParams.sort = frontendParams.sort;
  }
  if (frontendParams.page !== undefined && frontendParams.page !== '') {
    backendParams.page = frontendParams.page;
  }
  if (frontendParams.limit !== undefined && frontendParams.limit !== '') {
    backendParams.limit = frontendParams.limit;
  }

  // Support direct backend params if already mapped (backward compatibility)
  ['search', 'propertyType', 'listingType', 'bedrooms'].forEach((key) => {
    if (frontendParams[key] !== undefined && frontendParams[key] !== '') {
      backendParams[key] = frontendParams[key];
    }
  });

  // S11 geospatial params are canonical under their backend names already.
  ['lat', 'lng', 'radiusKm', 'bounds'].forEach((key) => {
    if (frontendParams[key] !== undefined && frontendParams[key] !== '') {
      backendParams[key] = frontendParams[key];
    }
  });

  return backendParams;
};

/**
 * Property API service for fetching property data
 */
export const propertyApi = {
  /**
   * Fetch paginated list of properties
   * @param {Object} params - Query parameters (frontend or backend format)
   * @param {Object} [options] - Additional Axios options (e.g. { signal })
   * @returns {Promise<Object>}
   */
  getProperties: async (params = {}, options = {}) => {
    const backendParams = mapFrontendToBackendParams(params);
    const response = await api.get('/properties', {
      params: backendParams,
      ...options,
    });
    return response.data;
  },

  /**
   * Fetch a single property by its ID
   * @param {string} id - Property ObjectId
   * @param {Object} [options] - Additional Axios options (e.g. { signal })
   * @returns {Promise<Object>}
   */
  getPropertyById: async (id, options = {}) => {
    const response = await api.get(`/properties/${id}`, options);
    return response.data;
  },

  /**
   * Fetch neighborhood context (nearby POIs + walk score) for a listing.
   * Public endpoint; params: { radiusKm?, category? }.
   */
  getNeighborhood: async (id, params = {}, options = {}) => {
    const response = await api.get(`/properties/${id}/neighborhood`, {
      params,
      ...options,
    });
    return response.data;
  },

  /**
   * S14 (ADR-038) — public comparison matrix. ids: array of 1-4 ObjectIds.
   * Returns { success, data: { properties, missing } } — partial results
   * by design: unknown ids come back in `missing`, not a 404.
   */
  compare: async (ids, options = {}) => {
    const response = await api.get('/properties/compare', {
      params: { ids: ids.join(',') },
      ...options,
    });
    return response.data;
  },

  /**
   * Create a property listing (agent/admin; ownership derived server-side)
   */
  createProperty: async (payload) => {
    const response = await api.post('/properties', payload);
    return response.data;
  },

  /**
   * Fetch the authenticated agent's own listings (agent dashboard)
   */
  getMyProperties: async (params = {}) => {
    const response = await api.get('/properties/mine', { params });
    return response.data;
  },

  /**
   * Partially update a listing (owner or admin)
   */
  updateProperty: async (id, payload) => {
    const response = await api.patch(`/properties/${id}`, payload);
    return response.data;
  },

  /**
   * Delete a listing (owner or admin)
   */
  deleteProperty: async (id) => {
    const response = await api.delete(`/properties/${id}`);
    return response.data;
  },

  // --- S13 media & verification (ADR-035/ADR-036) ---

  /**
   * Owner-scoped image list (normalized objects with imageId/publicId)
   */
  getImages: async (id) => {
    const response = await api.get(`/properties/${id}/images`);
    return response.data;
  },

  /**
   * Upload one or more image files (multipart). Server enforces type/size.
   */
  uploadImages: async (id, files) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    const response = await api.post(`/properties/${id}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteImage: async (id, imageId) => {
    const response = await api.delete(`/properties/${id}/images/${imageId}`);
    return response.data;
  },

  /**
   * Owner/admin verification document metadata list
   */
  getDocuments: async (id) => {
    const response = await api.get(`/properties/${id}/documents`);
    return response.data;
  },

  uploadDocuments: async (id, files) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    const response = await api.post(`/properties/${id}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteDocument: async (id, documentId) => {
    const response = await api.delete(`/properties/${id}/documents/${documentId}`);
    return response.data;
  },

  /**
   * Authenticated document delivery (owner/admin only; 404 otherwise).
   * `inline` selects browser display over attachment download.
   */
  getDocumentContentUrl: (id, documentId) => {
    const base = api.defaults.baseURL || '';
    return `${base}/properties/${id}/documents/${documentId}/content`;
  },

  /**
   * Agent submits an owned listing for verification (needs >= 1 document)
   */
  requestVerification: async (id) => {
    const response = await api.post(`/properties/${id}/request-verification`);
    return response.data;
  },
};

export default propertyApi;
