import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../../features/auth/authSlice";
import { LogOut, User, Heart, MessageSquare, Menu, X } from "lucide-react";

const Header = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const bookmarkCount = useSelector((state) => state.bookmarks.ids.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await dispatch(logoutUser());
    navigate("/");
  };

  // Single source of truth for role-gated navigation, rendered by both the
  // desktop row (>= lg) and the mobile panel (< lg) so they cannot diverge.
  const primaryLinks = [
    {
      to: "/listings",
      label: "Listings",
      desktopClass: "text-sm font-medium text-gray-600 hover:text-gray-900",
    },
  ];

  if (isAuthenticated && user) {
    primaryLinks.push(
      {
        to: "/bookmarks",
        label: "Saved",
        icon: Heart,
        badge: bookmarkCount,
        desktopClass:
          "flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors",
      },
      {
        to: "/inquiries",
        label: "Inquiries",
        icon: MessageSquare,
        desktopClass:
          "flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors",
      },
    );
    if (user.role === "agent" || user.role === "admin") {
      primaryLinks.push({
        to: "/agent",
        label: "Dashboard",
        desktopClass: "text-sm font-medium text-gray-600 hover:text-indigo-600",
      });
    }
    if (user.role === "admin") {
      primaryLinks.push({
        to: "/admin",
        label: "Admin",
        desktopClass: "text-sm font-medium text-gray-600 hover:text-indigo-600",
      });
    }
  }

  const mobileLinkClass =
    "flex min-h-11 items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          to="/"
          className="text-xl font-bold text-indigo-600"
          onClick={closeMenu}
        >
          HomeHunt
        </Link>

        <nav className="hidden items-center space-x-6 lg:flex" aria-label="Primary">
          {primaryLinks.map(({ to, label, icon: Icon, badge, desktopClass }) => (
            <Link key={to} to={to} className={desktopClass}>
              {Icon && <Icon className="h-4 w-4" />}
              <span>{label}</span>
              {badge > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">
                  {badge}
                </span>
              )}
            </Link>
          ))}

          {isAuthenticated && user ? (
            <div className="flex items-center space-x-4">
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

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-gray-200 bg-white px-4 py-3 lg:hidden"
          aria-label="Mobile"
        >
          {isAuthenticated && user && (
            <div className="mb-2 flex items-center gap-2 border-b border-gray-100 px-3 pb-3 text-sm text-gray-700">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <User className="h-4 w-4" />
              </span>
              <span className="truncate font-medium">{user.name}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
                {user.role}
              </span>
            </div>
          )}

          <ul className="space-y-1">
            {primaryLinks.map(({ to, label, icon: Icon, badge }) => (
              <li key={to}>
                <Link to={to} className={mobileLinkClass} onClick={closeMenu}>
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{label}</span>
                  {badge > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {isAuthenticated && user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          ) : (
            <div className="mt-2 space-y-1">
              <Link to="/login" className={mobileLinkClass} onClick={closeMenu}>
                Login
              </Link>
              <Link
                to="/register"
                className="flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-3 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                onClick={closeMenu}
              >
                Register
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
  );
};

export default Header;
