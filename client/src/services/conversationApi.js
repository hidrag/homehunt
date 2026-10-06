import api from '../lib/axios';

const conversationApi = {
  open: async (payload) => (await api.post('/conversations', payload)).data,
  getMine: async (params = {}) => (await api.get('/conversations', { params })).data,
  getMessages: async (id, params = {}) => (await api.get(`/conversations/${id}/messages`, { params })).data,
  sendMessage: async (id, body) => (await api.post(`/conversations/${id}/messages`, { body })).data,
  markRead: async (id) => (await api.post(`/conversations/${id}/read`)).data,
  getUnreadCount: async () => (await api.get('/conversations/unread-count')).data,
};

export default conversationApi;