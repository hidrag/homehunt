import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
  reducer: {
    // Slices will be added here in future sprints
    // e.g., auth: authReducer,
  },
});
