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

  /**
   * Get paginated inquiries addressed to the current agent (S6 inbox)
   */
  getAgentInquiries: async (params = {}) => {
    const response = await api.get('/inquiries/agent', { params });
    return response.data;
  },

  /**
   * Update the status of an inquiry managed by the current agent (S6)
   */
  updateInquiryStatus: async (id, status) => {
    const response = await api.patch(`/inquiries/${id}/status`, { status });
    return response.data;
  },
};

export default inquiryApi;
