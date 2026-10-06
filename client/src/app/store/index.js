import { configureStore } from '@reduxjs/toolkit';
import authReducer from "../../features/auth/authSlice";
import bookmarksReducer from "../../features/bookmarks/bookmarksSlice";
import chatReducer from "../../features/chat/chatSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    bookmarks: bookmarksReducer,
    chat: chatReducer,
  },
});
