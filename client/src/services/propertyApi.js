import api from '../lib/axios';

/**
 * Property API service for fetching property data
 */
export const propertyApi = {
  /**
   * Fetch paginated list of properties
   * @param {Object} params - Query parameters (page, limit)
   * @returns {Promise<Object>}
   */
  getProperties: async (params = {}) => {
    const response = await api.get('/properties', { params });
    return response.data;
  },

  /**
   * Fetch a single property by its ID
   * @param {string} id - Property ObjectId
   * @returns {Promise<Object>}
   */
  getPropertyById: async (id) => {
    const response = await api.get(`/properties/${id}`);
    return response.data;
  },
};

export default propertyApi;
