import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import notificationApi from '../../services/notificationApi';

/**
 * Shared notification state: the Header bell badge total every surface
 * needs (ADR-005). The inbox pages keep their lists in component state.
 *
 * Revision counter mirrors the bookmarks/chat slices (ADR-017): only the
 * most recently dispatched hydration may write `unread`. Socket
 * `notification:new` bumps the badge without a round trip.
 */
export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async (_, { getState, rejectWithValue }) => {
    const revision = getState().notifications.revision;
    try {
      const data = await notificationApi.getUnreadCount();
      return { unread: data.data.unread, revision };
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.error?.message || 'Failed to load notification count',
        revision,
      });
    }
  },
);

const initialState = {
  unread: 0,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  revision: 0,
  error: null,
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    resetNotifications: () => initialState,
    /** Real-time bump (socket notification:new). */
    bumpUnread: (state) => {
      state.unread += 1;
    },
    /** Optimistic zero after mark-all-read. */
    clearUnread: (state) => {
      state.revision += 1;
      state.unread = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnreadCount.pending, (state) => {
        state.revision += 1;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        if (action.payload.revision !== state.revision) return;
        state.status = 'succeeded';
        state.unread = action.payload.unread;
        state.error = null;
      })
      .addCase(fetchUnreadCount.rejected, (state, action) => {
        if (!action.payload || action.payload.revision !== state.revision) return;
        state.status = 'failed';
        state.error = action.payload.message;
      });
  },
});

export const { resetNotifications, bumpUnread, clearUnread } = notificationsSlice.actions;
export default notificationsSlice.reducer;
