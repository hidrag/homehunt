import * as service from '../services/conversation.service.js';

const fail = (res, e) => res.status(e.status || 500).json({
  success: false,
  error: { code: e.code || 'INTERNAL_SERVER_ERROR', message: e.message || 'Unexpected error' },
});

const paging = (query, defaultLimit = 10) => [
  Math.max(1, parseInt(query.page, 10) || 1),
  Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit)),
];

export const open = async (req, res) => {
  try {
    const result = await service.openConversation(req.user.id, req.body);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: { conversation: result.conversation, message: result.message },
    });
  } catch (e) { return fail(res, e); }
};

export const mine = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    const role = req.user.role === 'agent' ? 'agent' : 'buyer';
    return res.json({ success: true, data: await service.listConversations(req.user.id, role, page, limit) });
  } catch (e) { return fail(res, e); }
};

export const messages = async (req, res) => {
  try {
    const [page, limit] = paging(req.query, 20);
    return res.json({ success: true, data: await service.listMessages(req.params.id, req.user.id, page, limit) });
  } catch (e) { return fail(res, e); }
};

export const send = async (req, res) => {
  try {
    const result = await service.sendMessage(req.params.id, req.user.id, req.body);
    return res.status(201).json({ success: true, data: result });
  } catch (e) { return fail(res, e); }
};

export const read = async (req, res) => {
  try {
    return res.json({ success: true, data: { conversation: await service.markRead(req.params.id, req.user.id) } });
  } catch (e) { return fail(res, e); }
};

export const unread = async (req, res) => {
  try {
    return res.json({ success: true, data: await service.unreadCount(req.user.id) });
  } catch (e) { return fail(res, e); }
};

export const adminList = async (req, res) => {
  try {
    const [page, limit] = paging(req.query);
    return res.json({ success: true, data: await service.adminListConversations(page, limit) });
  } catch (e) { return fail(res, e); }
};

export const adminMessages = async (req, res) => {
  try {
    const [page, limit] = paging(req.query, 20);
    return res.json({ success: true, data: await service.adminListMessages(req.params.id, page, limit) });
  } catch (e) { return fail(res, e); }
};