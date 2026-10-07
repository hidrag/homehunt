import * as service from '../services/savedSearch.service.js';

const fail = (res, e) => res.status(e.status || 500).json({
  success: false,
  error: { code: e.code || 'INTERNAL_SERVER_ERROR', message: e.message || 'Unexpected error' },
});

const paging = (query, defaultLimit = 10) => [
  Math.max(1, parseInt(query.page, 10) || 1),
  Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit)),
];

export const create = async (req, res) => {
  try {
    const savedSearch = await service.create(req.user.id, req.body || {});
    return res.status(201).json({ success: true, data: { savedSearch } });
  } catch (e) { return fail(res, e); }
};

export const mine = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    return res.json({ success: true, data: await service.list(req.user.id, page, limit) });
  } catch (e) { return fail(res, e); }
};

export const one = async (req, res) => {
  try {
    return res.json({ success: true, data: { savedSearch: await service.get(req.params.id, req.user.id) } });
  } catch (e) { return fail(res, e); }
};

export const update = async (req, res) => {
  try {
    return res.json({ success: true, data: { savedSearch: await service.update(req.params.id, req.user.id, req.body || {}) } });
  } catch (e) { return fail(res, e); }
};

export const remove = async (req, res) => {
  try {
    return res.json({ success: true, data: await service.remove(req.params.id, req.user.id) });
  } catch (e) { return fail(res, e); }
};

export const run = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    return res.json({ success: true, data: await service.run(req.params.id, req.user.id, page, limit) });
  } catch (e) { return fail(res, e); }
};