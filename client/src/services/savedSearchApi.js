import api from '../lib/axios';

const savedSearchApi = {
  create: async (payload) => (await api.post('/saved-searches', payload)).data,
  getMine: async (params = {}) => (await api.get('/saved-searches', { params })).data,
  getOne: async (id) => (await api.get(`/saved-searches/${id}`)).data,
  update: async (id, payload) => (await api.patch(`/saved-searches/${id}`, payload)).data,
  remove: async (id) => (await api.delete(`/saved-searches/${id}`)).data,
  run: async (id, params = {}) => (await api.post(`/saved-searches/${id}/run`, null, { params })).data,
};

export default savedSearchApi;
