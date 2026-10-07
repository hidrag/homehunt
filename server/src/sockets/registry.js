/**
 * App-level Socket.io registry.
 *
 * `server.js` attaches the live Socket.io server instance after HTTP
 * bootstrap. Services and controllers emit through this module instead of
 * importing the server, so the REST layer works unchanged when no socket
 * server exists (plain `app.listen` runs, unit contexts, supertest-only
 * suites): emit helpers are no-ops until `setIo` is called.
 *
 * Deliberate S9 boundary: the default in-memory adapter is a single-process
 * guarantee (ADR-028). Multi-instance deployments need the Redis adapter —
 * recorded for S16.
 */
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const getIo = () => io;

/** Emit an event to every socket in a conversation's room (no-op without a server). */
export const emitToConversation = (conversationId, event, payload) => {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event, payload);
};

/**
 * Emit an event to a user's personal room (S10, ADR-030). Every
 * authenticated socket auto-joins `user:${id}` on connection — the room
 * name is derived from the verified handshake token, never from client
 * input. No-op without a socket server (REST-only test contexts).
 */
export const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
};