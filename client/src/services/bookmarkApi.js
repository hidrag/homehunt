import api from '../lib/axios';

/**
 * Bookmark API services
 */
const bookmarkApi = {
  /**
   * Get paginated bookmarks for the current user
   */
  getBookmarks: async (params = {}) => {
    const response = await api.get('/bookmarks', { params });
    return response.data;
  },

  /**
   * Add a bookmark
   */
  addBookmark: async (propertyId) => {
    const response = await api.post('/bookmarks', { propertyId });
    return response.data;
  },

  /**
   * Remove a bookmark
   */
  removeBookmark: async (propertyId) => {
    const response = await api.delete(`/bookmarks/${propertyId}`);
    return response.data;
  },

  /**
   * Get all bookmarked property IDs (for hydration)
   */
  getBookmarkIds: async () => {
    const response = await api.get('/bookmarks/ids');
    return response.data;
  },
};

export default bookmarkApi;
