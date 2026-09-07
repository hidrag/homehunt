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
};

export default propertyApi;
