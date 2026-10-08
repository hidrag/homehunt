import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/analytics`,
  withCredentials: true,
});

/**
 * S14 (ADR-037) — public city market aggregates.
 * @param {{city: string, listingType?: 'sale'|'rent'}} params
 * @returns {Promise<{success:boolean, data:{analytics:Object}}>}
 */
export const getMarketAnalytics = async ({ city, listingType } = {}, options = {}) => {
  const response = await api.get('/market', { params: { city, listingType }, ...options });
  return response.data;
};

export default { getMarketAnalytics };
