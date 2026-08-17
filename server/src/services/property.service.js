import Property from '../models/Property.js';

class PropertyService {
  /**
   * Get a paginated list of properties
   * @param {number} page 
   * @param {number} limit 
   * @returns {Promise<Object>}
   */
  async getProperties(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find({})
        .select('-__v') // Exclude heavy/internal fields if needed
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments({}),
    ]);

    return {
      properties,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }

  /**
   * Get a single property by ID
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async getPropertyById(id) {
    return Property.findById(id).select('-__v').lean();
  }
}

export default new PropertyService();
