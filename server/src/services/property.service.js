import Property from '../models/Property.js';

class PropertyService {
  /**
   * Get a paginated list of properties with optional filter and sort
   * @param {Object|number} filter
   * @param {Object|number} sort
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<Object>}
   */
  async getProperties(
    filter = {},
    sort = { createdAt: -1, _id: -1 },
    page = 1,
    limit = 10,
  ) {
    if (typeof filter === "number") {
      const p = filter;
      const l = typeof sort === "number" ? sort : 10;
      return this.getProperties({}, { createdAt: -1, _id: -1 }, p, l);
    }

    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .select("-__v")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
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
    return Property.findById(id).select("-__v").lean();
  }
}

export default new PropertyService();
