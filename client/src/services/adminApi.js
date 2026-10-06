import api from '../lib/axios';

/**
 * Admin API services (S7 admin platform)
 */
const adminApi = {
  /**
   * Lightweight platform overview for the admin dashboard
   */
  getStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  /**
   * Paginated user directory with role filter and name/email search
   */
  getUsers: async (params = {}) => {
    const response = await api.get('/admin/users', { params });
    return response.data;
  },

  /**
   * Provision a new agent/admin account (admin-only, ADR-021)
   */
  provisionUser: async (payload) => {
    const response = await api.post('/admin/users', payload);
    return response.data;
  },

  /**
   * Change a user's role (admin-only; server enforces self/last-admin guards)
   */
  changeUserRole: async (id, role) => {
    const response = await api.patch(`/admin/users/${id}/role`, { role });
    return response.data;
  },

  /**
   * Cross-listing moderation view
   */
  getProperties: async (params = {}) => {
    const response = await api.get('/admin/properties', { params });
    return response.data;
  },

  /**
   * Cross-agent inquiry administration view
   */
  getInquiries: async (params = {}) => {
    const response = await api.get('/admin/inquiries', { params });
    return response.data;
  },

  /**
   * Update the status of any inquiry (explicit admin route)
   */
  updateInquiryStatus: async (id, status) => {
    const response = await api.patch(`/admin/inquiries/${id}/status`, { status });
    return response.data;
  },

  /**
   * Cross-agent visit administration view (explicit admin route)
   */
  getVisits: async (params = {}) => {
    const response = await api.get('/admin/visits', { params });
    return response.data;
  },

  /**
   * Update visit status (admin-only explicit route)
   */
  updateVisitStatus: async (id, status) => {
    const response = await api.patch(`/admin/visits/${id}/status`, { status });
    return response.data;
  },
};

export default adminApi;
