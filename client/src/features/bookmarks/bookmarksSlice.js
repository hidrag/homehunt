import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import bookmarkApi from '../../services/bookmarkApi';

/**
 * Fetch all bookmarked property IDs for hydration.
 * A revision counter ensures only the most recently dispatched hydration
 * (or toggle) may write `ids`; older in-flight responses are discarded so a
 * stale GET /ids can never overwrite newer optimistic state.
 */
export const fetchBookmarkIds = createAsyncThunk(
  'bookmarks/fetchBookmarkIds',
  async (_, { getState, rejectWithValue }) => {
    const revision = getState().bookmarks.revision;
    try {
      const data = await bookmarkApi.getBookmarkIds();
      return { ids: data.data.ids, revision };
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.error?.message || 'Failed to load bookmarks',
        revision,
      });
    }
  }
);

/**
 * Toggle a bookmark (add or remove) with optimistic UI
 */
export const toggleBookmark = createAsyncThunk(
  'bookmarks/toggleBookmark',
  async ({ propertyId, next }, { rejectWithValue }) => {
    try {
      if (next) {
        await bookmarkApi.addBookmark(propertyId);
      } else {
        await bookmarkApi.removeBookmark(propertyId);
      }
      return { propertyId, next };
    } catch (err) {
      return rejectWithValue({
        propertyId,
        next,
        message: err.response?.data?.error?.message || 'Failed to update bookmark',
      });
    }
  }
);

const initialState = {
  ids: [],
  idsStatus: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  pendingIds: [], // property IDs currently being toggled (in-flight guard)
  revision: 0, // monotonic write-order guard against stale async responses
  error: null,
};

const bookmarksSlice = createSlice({
  name: 'bookmarks',
  initialState,
  reducers: {
    resetBookmarks: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // fetchBookmarkIds
      .addCase(fetchBookmarkIds.pending, (state) => {
        state.revision += 1;
        state.idsStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchBookmarkIds.fulfilled, (state, action) => {
        if (action.payload.revision !== state.revision) return;
        state.idsStatus = 'succeeded';
        state.ids = action.payload.ids;
        state.error = null;
      })
      .addCase(fetchBookmarkIds.rejected, (state, action) => {
        if (!action.payload || action.payload.revision !== state.revision) return;
        state.idsStatus = 'failed';
        state.error = action.payload.message;
      })

      // toggleBookmark — optimistic UI
      .addCase(toggleBookmark.pending, (state, action) => {
        const { propertyId, next } = action.meta.arg;
        state.revision += 1;
        if (!state.pendingIds.includes(propertyId)) {
          state.pendingIds.push(propertyId);
        }
        if (next) {
          if (!state.ids.includes(propertyId)) {
            state.ids.push(propertyId);
          }
        } else {
          state.ids = state.ids.filter((id) => id !== propertyId);
        }
        state.error = null;
      })
      .addCase(toggleBookmark.fulfilled, (state, action) => {
        const { propertyId, next } = action.payload;
        state.pendingIds = state.pendingIds.filter((id) => id !== propertyId);
        if (next) {
          if (!state.ids.includes(propertyId)) {
            state.ids.push(propertyId);
          }
        } else {
          state.ids = state.ids.filter((id) => id !== propertyId);
        }
      })
      .addCase(toggleBookmark.rejected, (state, action) => {
        const arg = action.meta.arg;
        const propertyId = arg && arg.propertyId;
        if (propertyId) {
          const revertTo = !arg.next;
          if (revertTo) {
            if (!state.ids.includes(propertyId)) {
              state.ids.push(propertyId);
            }
          } else {
            state.ids = state.ids.filter((id) => id !== propertyId);
          }
          state.pendingIds = state.pendingIds.filter((id) => id !== propertyId);
        }
        state.error = action.payload?.message || 'Failed to update bookmark';
      });
  },
});

export const { resetBookmarks } = bookmarksSlice.actions;
export default bookmarksSlice.reducer;
