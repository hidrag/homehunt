import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import { getAuthConfig } from "./config/auth.js";
import { socketAuth } from './sockets/auth.middleware.js';
import { registerChatHandlers } from './sockets/chat.handler.js';
import { setIo } from './sockets/registry.js';

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// S16 (ADR-042) — bounded shutdown window. Containers get a stop grace period
// (docker default 10 s); we finish well inside it and force-exit if a
// connection refuses to drain so the orchestrator never has to SIGKILL.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 8000;

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

    // S16 (ADR-042) — graceful shutdown: stop accepting new work, close the
    // websocket layer, then the HTTP server, then MongoDB. Idempotent (a
    // second signal during drain is ignored) and bounded.
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n${signal} received — shutting down gracefully...`);

      const forceExit = setTimeout(() => {
        console.error('Shutdown timed out — forcing exit.');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceExit.unref();

      try {
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
        await mongoose.connection.close(false);
        console.log('Shutdown complete.');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start the server:', error.message);
    process.exit(1);
  }
};

startServer();
