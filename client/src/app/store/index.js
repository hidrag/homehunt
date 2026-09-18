import { configureStore } from '@reduxjs/toolkit';
import authReducer from "../../features/auth/authSlice";
import bookmarksReducer from "../../features/bookmarks/bookmarksSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    bookmarks: bookmarksReducer,
  },
});
