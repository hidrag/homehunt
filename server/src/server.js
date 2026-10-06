import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import { getAuthConfig } from "./config/auth.js";
import { socketAuth } from './sockets/auth.middleware.js';
import { registerChatHandlers } from './sockets/chat.handler.js';
import { setIo } from './sockets/registry.js';

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const startServer = async () => {
  try {
    // Fail-fast verification of required authentication environment variables
    getAuthConfig();

    // Connect to database if URI is provided
    if (process.env.MONGODB_URI) {
      await connectDB();
    } else {
      console.warn(
        "⚠️  MONGODB_URI is not defined. Skipping database connection.",
      );
    }

    // Create HTTP server for combined Express + Socket.io
    const server = http.createServer(app);

    // Socket.io server with CORS matching CLIENT_URL
    const io = new SocketIOServer(server, {
      cors: {
        origin: CLIENT_URL,
        credentials: true,
      },
    });

    // Socket.io authentication handshake middleware
    io.use(socketAuth);

    // Register chat room handlers (join/leave only; sending is REST-only)
    registerChatHandlers(io);

    // Expose the live io instance to the service layer (emit no-ops without it)
    setIo(io);

    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error.message);
    process.exit(1);
  }
};

startServer();
