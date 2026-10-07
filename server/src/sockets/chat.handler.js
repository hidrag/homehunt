import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';

/**
 * Socket.io chat room handlers (ADR-006: conversation-based rooms).
 *
 * Clients may only join rooms for conversations they participate in. The
 * participant check runs against the database on every join — socket user
 * claims from the handshake token are never trusted for room membership.
 * Admins are not participants of any conversation, so the same check
 * rejects them: admins audit over REST only (S9 locked decision).
 *
 * Message sending is intentionally absent: REST is the only send path
 * (ADR-026). Clients emit join/leave exclusively.
 */
export const registerChatHandlers = (io) => {
  io.on('connection', (socket) => {
    // S10 (ADR-030): authenticated sockets auto-join their own user room.
    // Identity comes from the verified handshake token — no client-supplied
    // room name exists for this channel, so there is no join-authorization
    // surface (unlike conversation:join, which re-checks the database).
    socket.join(`user:${socket.user.id}`);

    socket.on('conversation:join', async (conversationId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (!mongoose.isValidObjectId(conversationId)) {
          return reply({ error: 'INVALID_ID' });
        }
        const conversation = await Conversation.findById(conversationId).select('buyer agent').lean();
        const actor = String(socket.user.id);
        const isParticipant =
          conversation &&
          (String(conversation.buyer) === actor || String(conversation.agent) === actor);
        if (!isParticipant) {
          // Non-participants are rejected and disconnected: room existence
          // is never enumerable (404-analogue per the S8 enumeration guard).
          reply({ error: 'NOT_FOUND' });
          socket.disconnect(true);
          return undefined;
        }
        await socket.join(`conversation:${conversationId}`);
        return reply({ joined: true });
      } catch {
        return reply({ error: 'INTERNAL_SERVER_ERROR' });
      }
    });

    socket.on('conversation:leave', async (conversationId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await socket.leave(`conversation:${conversationId}`);
        return reply({ left: true });
      } catch {
        return reply({ error: 'INTERNAL_SERVER_ERROR' });
      }
    });
  });
};