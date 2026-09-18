import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../../features/auth/authSlice";
import { LogOut, User, Heart, MessageSquare } from "lucide-react";

const Header = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const bookmarkCount = useSelector((state) => state.bookmarks.ids.length);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/");
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="text-xl font-bold text-indigo-600">
          HomeHunt
        </Link>
        <nav className="flex items-center space-x-6">
          <Link
            to="/listings"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Listings
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center space-x-4">
              <Link
                to="/bookmarks"
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Heart className="h-4 w-4" />
                <span>Saved</span>
                {bookmarkCount > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">
                    {bookmarkCount}
                  </span>
                )}
              </Link>
              <Link
                to="/inquiries"
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Inquiries</span>
              </Link>
              {user.role === "admin" && (
                <Link
                  to="/admin"
                  className="text-sm font-medium text-gray-600 hover:text-indigo-600"
                >
                  Admin
                </Link>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <User className="h-4 w-4" />
                </span>
                <span className="font-medium">{user.name}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  {user.role}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
