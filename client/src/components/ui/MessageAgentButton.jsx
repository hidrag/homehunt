import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { MessageSquarePlus } from 'lucide-react';
import conversationApi from '../../services/conversationApi';

/**
 * Opens (or reuses) the buyer's property-bound conversation with the listing
 * agent. POST /api/conversations is idempotent on (property, buyer): a repeat
 * open returns the existing thread, so this doubles as "open my thread".
 */
const MessageAgentButton = ({ propertyId }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthenticated && user?.role !== 'buyer') return null;

  const handleClick = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const result = await conversationApi.open({ propertyId, body: 'Hi, I would like to know more about this property.' });
      navigate(`/messages/${result.data.conversation._id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not start the conversation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="message-agent-heading">
      <h2 id="message-agent-heading" className="text-xl font-semibold text-gray-900">Message the agent</h2>
      <p className="mt-1 text-sm text-gray-500">
        Chat in real time about this listing. Your message starts a conversation with the listing agent.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {isAuthenticated ? (
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          {busy ? 'Opening…' : 'Message the agent'}
        </button>
      ) : (
        <Link
          to="/login"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Sign in to message
        </Link>
      )}
    </section>
  );
};

export default MessageAgentButton;