import { io } from 'socket.io-client';

/**
 * Singleton Socket.io client (ADR-026).
 *
 * Created lazily once authentication is known and torn down on logout. The
 * socket carries the same HTTP-only session cookie as the REST API
 * (`withCredentials`), so the server-side handshake middleware authenticates
 * it identically. Sending messages is REST-only — this client only joins and
 * leaves conversation rooms and listens for server events.
 *
 * The instance is deliberately module-level, never Redux state: socket
 * objects are not serializable and must not be diffed by the store.
 */
const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
};

export const connectSocket = () => {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

export const joinConversation = (conversationId, ack) =>
  getSocket().emit('conversation:join', conversationId, ack);

export const leaveConversation = (conversationId) =>
  getSocket().emit('conversation:leave', conversationId);

export default { getSocket, connectSocket, disconnectSocket, joinConversation, leaveConversation };