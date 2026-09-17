import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';
import { getAuthConfig } from "./config/auth.js";

const PORT = process.env.PORT || 5000;

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

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error.message);
    process.exit(1);
  }
};

startServer();
