import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import { store } from "./app/store";
import { checkAuth } from "./features/auth/authSlice";
import {
  fetchBookmarkIds,
  resetBookmarks,
} from "./features/bookmarks/bookmarksSlice";

import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import Listings from "./pages/Listings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Admin from "./pages/Admin";
import ListingDetail from "./pages/ListingDetail";
import Bookmarks from "./pages/Bookmarks";
import MyInquiries from "./pages/MyInquiries";
import ProtectedRoute from "./components/auth/ProtectedRoute";

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

  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="listings" element={<Listings />} />
          <Route path="listings/:id" element={<ListingDetail />} />
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
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
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
