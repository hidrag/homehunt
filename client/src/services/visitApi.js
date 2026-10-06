import api from '../lib/axios';

const visitApi = {
  create: async (payload) => (await api.post('/visits', payload)).data,
  getMine: async (params = {}) => (await api.get('/visits', { params })).data,
  getAgent: async (params = {}) => (await api.get('/visits/agent', { params })).data,
  updateStatus: async (id, status) => (await api.patch(`/visits/${id}/status`, { status })).data,
};

export default visitApi;
