import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import conversationApi from '../../services/conversationApi';

/**
 * Shared chat state: only the unread total that the Header badge and
 * navigation need (ADR-005 — genuinely shared state). The open transcript
 * lives in component local state.
 *
 * A revision counter mirrors the bookmarks slice (ADR-017): only the most
 * recently dispatched hydration may write `unread`, so a stale in-flight
 * response can never clobber a newer count.
 */
export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  async (_, { getState, rejectWithValue }) => {
    const revision = getState().chat.revision;
    try {
      const data = await conversationApi.getUnreadCount();
      return { unread: data.data.unread, revision };
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.error?.message || 'Failed to load unread count',
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

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    resetChat: () => initialState,
    /** Optimistic local adjustment (e.g. after opening a thread). */
    setUnread: (state, action) => {
      state.revision += 1;
      state.unread = Math.max(0, Number(action.payload) || 0);
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

export const { resetChat, setUnread } = chatSlice.actions;
export default chatSlice.reducer;