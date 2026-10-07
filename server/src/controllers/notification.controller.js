import * as service from '../services/notification.service.js';

const fail = (res, e) => res.status(e.status || 500).json({
  success: false,
  error: { code: e.code || 'INTERNAL_SERVER_ERROR', message: e.message || 'Unexpected error' },
});

const paging = (query, defaultLimit = 10) => [
  Math.max(1, parseInt(query.page, 10) || 1),
  Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit)),
];

// Whitelisted unread filter: only 'true'/'false' strings narrow the query;
// any other value is ignored (returns everything).
const parseUnread = (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined);

export const list = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    return res.json({ success: true, data: await service.list(req.user.id, page, limit, parseUnread(req.query.unread)) });
  } catch (e) { return fail(res, e); }
};

export const unread = async (req, res) => {
  try {
    return res.json({ success: true, data: await service.unreadCount(req.user.id) });
  } catch (e) { return fail(res, e); }
};

export const read = async (req, res) => {
  try {
    return res.json({ success: true, data: { notification: await service.markRead(req.params.id, req.user.id) } });
  } catch (e) { return fail(res, e); }
};

export const readAll = async (req, res) => {
  try {
    return res.json({ success: true, data: await service.markAllRead(req.user.id) });
  } catch (e) { return fail(res, e); }
};

export const remove = async (req, res) => {
  try {
    return res.json({ success: true, data: await service.remove(req.params.id, req.user.id) });
  } catch (e) { return fail(res, e); }
};