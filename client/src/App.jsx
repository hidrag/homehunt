import React, { useEffect, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import { store } from "./app/store";
import { checkAuth } from "./features/auth/authSlice";
import {
  fetchBookmarkIds,
  resetBookmarks,
} from "./features/bookmarks/bookmarksSlice";
import { fetchUnreadCount as fetchChatUnread, resetChat } from "./features/chat/chatSlice";
import {
  fetchUnreadCount as fetchNotificationUnread,
  resetNotifications,
  bumpUnread,
} from "./features/notifications/notificationsSlice";
import { connectSocket, disconnectSocket, getSocket } from "./lib/socket";
import { showBackgroundNotification } from "./lib/backgroundNotifications";

import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Bookmarks from "./pages/Bookmarks";
import MyInquiries from "./pages/MyInquiries";
import Visits from "./pages/Visits";
import Notifications from "./pages/Notifications";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PageSpinner from "./components/ui/PageSpinner";

// S15 (ADR-040) — heavy routes are lazily loaded so their code (Leaflet for
// map pages, chat surface, dashboards, forms) never ships in the initial
// chunk. Home/Login/Register stay eager (cold-traffic pages).
const Listings = React.lazy(() => import("./pages/Listings"));
const ListingDetail = React.lazy(() => import("./pages/ListingDetail"));
const Compare = React.lazy(() => import("./pages/Compare"));
const Messages = React.lazy(() => import("./pages/Messages"));
const Admin = React.lazy(() => import("./pages/Admin"));
const AgentDashboard = React.lazy(() => import("./pages/AgentDashboard"));
const ListingForm = React.lazy(() => import("./pages/ListingForm"));
const SavedSearches = React.lazy(() => import("./pages/SavedSearches"));
const Offline = React.lazy(() => import("./pages/Offline"));

function AppContent() {
  const dispatch = useDispatch();
  const { isAuthenticated, initialized } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

  // Hydrate bookmark IDs after authentication state is known
  useEffect(() => {
    if (!initialized) return;

    if (isAuthenticated) {
      dispatch(fetchBookmarkIds());
    } else {
      dispatch(resetBookmarks());
    }
  }, [dispatch, isAuthenticated, initialized]);

  // Chat & notifications: hydrate badges and hold the socket open while
  // signed in. Sockets are created only after auth is known and torn down
  // on logout. Server auto-joins every socket to its user room (ADR-030).
  useEffect(() => {
    if (!initialized) return undefined;

    if (isAuthenticated) {
      dispatch(fetchChatUnread());
      dispatch(fetchNotificationUnread());
      const socket = connectSocket();
      // S15 — backgrounded tab: also surface an OS-level local notification
      // (no-op unless permission was granted via the bell toggle and the tab
      // is hidden). Never delays the in-app badge update.
      const onNotification = (payload) => {
        dispatch(bumpUnread());
        showBackgroundNotification(payload?.notification);
      };
      socket.on('notification:new', onNotification);
      return () => {
        getSocket().off('notification:new', onNotification);
        disconnectSocket();
      };
    }

    disconnectSocket();
    dispatch(resetChat());
    dispatch(resetNotifications());
    return undefined;
  }, [dispatch, isAuthenticated, initialized]);

  return (
    <Router>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="listings" element={<Listings />} />
            <Route path="listings/:id" element={<ListingDetail />} />
            <Route path="compare" element={<Compare />} />
            <Route path="offline" element={<Offline />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
          <Route
            path="bookmarks"
            element={
              <ProtectedRoute>
                <Bookmarks />
              </ProtectedRoute>
            }
          />
          <Route
            path="inquiries"
            element={
              <ProtectedRoute>
                <MyInquiries />
              </ProtectedRoute>
            }
          />
          <Route path="visits" element={<ProtectedRoute><Visits /></ProtectedRoute>} />
          <Route
            path="saved-searches"
            element={
              <ProtectedRoute allowedRoles={["buyer"]}>
                <SavedSearches />
              </ProtectedRoute>
            }
          />
          <Route
            path="notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="messages"
            element={
              <ProtectedRoute allowedRoles={["buyer", "agent"]}>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="messages/:conversationId"
            element={
              <ProtectedRoute allowedRoles={["buyer", "agent"]}>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="agent"
            element={
              <ProtectedRoute allowedRoles={["agent", "admin"]}>
                <AgentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="agent/listings/new"
            element={
              <ProtectedRoute allowedRoles={["agent", "admin"]}>
                <ListingForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="agent/listings/:id/edit"
            element={
              <ProtectedRoute allowedRoles={["agent", "admin"]}>
                <ListingForm />
              </ProtectedRoute>
            }
          />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
