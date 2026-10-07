import api from '../lib/axios';

const notificationApi = {
  list: async (params = {}) => (await api.get('/notifications', { params })).data,
  getUnreadCount: async () => (await api.get('/notifications/unread-count')).data,
  markRead: async (id) => (await api.patch(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.patch('/notifications/read-all')).data,
  remove: async (id) => (await api.delete(`/notifications/${id}`)).data,
};

export default notificationApi;
