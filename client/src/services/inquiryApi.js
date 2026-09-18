import api from '../lib/axios';

/**
 * Inquiry API services
 */
const inquiryApi = {
  /**
   * Create a new inquiry
   */
  createInquiry: async (data) => {
    const response = await api.post('/inquiries', data);
    return response.data;
  },

  /**
   * Get paginated inquiries for the current user
   */
  getInquiries: async (params = {}) => {
    const response = await api.get('/inquiries', { params });
    return response.data;
  },
};

export default inquiryApi;
