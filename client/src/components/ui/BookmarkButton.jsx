import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { toggleBookmark } from '../../features/bookmarks/bookmarksSlice';

const BookmarkButton = ({ propertyId, className = '' }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated } = useSelector((state) => state.auth);
  const { ids, pendingIds } = useSelector((state) => state.bookmarks);

  const isBookmarked = ids.includes(propertyId);
  const isPending = pendingIds.includes(propertyId);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }

    if (isPending) return; // prevent double-click

    dispatch(toggleBookmark({ propertyId, next: !isBookmarked }));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isBookmarked}
      aria-label={isBookmarked ? 'Remove from saved properties' : 'Save property'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
        isBookmarked
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'bg-white/90 text-gray-500 hover:bg-white hover:text-red-500'
      } ${className}`}
    >
      <Heart
        className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`}
      />
    </button>
  );
};

export default BookmarkButton;
