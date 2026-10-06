import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import conversationApi from '../services/conversationApi';
import { getSocket, joinConversation, leaveConversation } from '../lib/socket';
import { setUnread } from '../features/chat/chatSlice';

const PAGE_SIZE = 10;
const MESSAGE_LIMIT = 30;

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const inboxTitle = (conversation) => {
  if (conversation.property) return conversation.property.title;
  return 'Listing no longer available';
};

const counterpart = (conversation, role) => {
  const other = role === 'agent' ? conversation.buyer : conversation.agent;
  return other?.name || 'Account unavailable';
};

const Messages = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { user } = useSelector((state) => state.auth);
  const role = user?.role === 'agent' ? 'agent' : 'buyer';

  const [params, setParams] = useSearchParams();
  const page = Math.max(Number.parseInt(params.get('page') || '1', 10) || 1, 1);

  const [conversations, setConversations] = useState([]);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [listRetry, setListRetry] = useState(0);

  const [messages, setMessages] = useState([]);
  const [messagePagination, setMessagePagination] = useState({ pages: 1, total: 0 });
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);
  const [threadRetry, setThreadRetry] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const bottomRef = useRef(null);

  // ---- Inbox ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setListLoading(true);
        setListError(null);
        const result = await conversationApi.getMine({ page, limit: PAGE_SIZE });
        if (cancelled) return;
        setConversations(result.data.conversations);
        setPagination(result.data.pagination);
      } catch {
        if (!cancelled) setListError('Failed to load your conversations. Please try again.');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [page, listRetry]);

  // ---- Thread ----
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setThreadLoading(true);
        setThreadError(null);
        const result = await conversationApi.getMessages(conversationId, { limit: MESSAGE_LIMIT });
        if (cancelled) return;
        setMessages(result.data.messages);
        setMessagePagination(result.data.pagination);
        await conversationApi.markRead(conversationId);
        if (cancelled) return;
        // Reading this thread clears its contribution to the badge.
        const unread = await conversationApi.getUnreadCount();
        if (!cancelled) dispatch(setUnread(unread.data.unread));
      } catch {
        if (!cancelled) setThreadError('Failed to load this conversation. Please try again.');
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [conversationId, threadRetry, dispatch]);

  // ---- Live delivery: join the room and append broadcasts ----
  useEffect(() => {
    if (!conversationId) return undefined;
    const socket = getSocket();

    const onMessage = (message) => {
      if (String(message.conversation) !== String(conversationId)) return;
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [message, ...prev]));
    };
    const onUpdated = (payload) => {
      if (String(payload._id) !== String(conversationId)) return;
      setConversations((prev) => prev.map((c) => (c._id === payload._id ? { ...c, ...payload } : c)));
    };

    const attach = () => {
      socket.on('message:new', onMessage);
      socket.on('conversation:updated', onUpdated);
      joinConversation(conversationId, () => {});
    };
    attach();
    socket.on('connect', attach);

    return () => {
      socket.off('connect', attach);
      socket.off('message:new', onMessage);
      socket.off('conversation:updated', onUpdated);
      leaveConversation(conversationId);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const changePage = (newPage) => {
    const next = new URLSearchParams(params);
    if (newPage <= 1) next.delete('page');
    else next.set('page', String(newPage));
    setParams(next);
  };

  const openThread = (id) => navigate(`/messages/${id}`);

  const handleSend = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    try {
      setSending(true);
      setSendError(null);
      const result = await conversationApi.sendMessage(conversationId, body);
      const message = result.data.message;
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [message, ...prev]));
      setConversations((prev) => prev.map((c) => (
        c._id === conversationId ? { ...c, lastMessage: { body: message.body, sender: message.sender, sentAt: message.createdAt } } : c
      )));
      setDraft('');
    } catch (error) {
      setSendError(error.response?.data?.error?.message || 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  const paginationButton =
    'min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  const list = (
    <div className="min-w-0">
      {listLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      ) : listError ? (
        <div role="alert" className="rounded-lg bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">{listError}</p>
          <button type="button" onClick={() => setListRetry((c) => c + 1)} className={`${paginationButton} mt-4`}>
            Try Again
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <MessageSquare className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No conversations yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Open a listing and use &quot;Message the agent&quot; to start a conversation.
          </p>
          <Link to="/listings" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
            Browse listings
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {conversations.map((conversation) => {
              const unread = role === 'agent' ? conversation.agentUnread : conversation.buyerUnread;
              const active = String(conversation._id) === String(conversationId);
              return (
                <li key={conversation._id}>
                  <button
                    type="button"
                    onClick={() => openThread(conversation._id)}
                    className={`flex w-full min-w-0 items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50 ${active ? 'bg-indigo-50/60' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-gray-900">{inboxTitle(conversation)}</span>
                      <span className="mt-0.5 block break-words text-xs text-gray-500">
                        {counterpart(conversation, role)} · {formatWhen(conversation.lastMessage?.sentAt || conversation.updatedAt)}
                      </span>
                      <span className="mt-1 block truncate text-sm text-gray-600">{conversation.lastMessage?.body}</span>
                    </span>
                    {unread > 0 && (
                      <span className="mt-1 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {pagination.pages > 1 && (
            <nav aria-label="Conversations pagination" className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-700">
              <button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} className={paginationButton}>Previous</button>
              <span className="px-2" aria-live="polite">Page {page} of {pagination.pages}</span>
              <button type="button" disabled={page >= pagination.pages} onClick={() => changePage(page + 1)} className={paginationButton}>Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  );

  const thread = conversationId ? (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => navigate('/messages')}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg text-sm font-medium text-gray-600 hover:text-indigo-600 lg:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        All conversations
      </button>

      {threadLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      ) : threadError ? (
        <div role="alert" className="rounded-lg bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">{threadError}</p>
          <button type="button" onClick={() => setThreadRetry((c) => c + 1)} className={`${paginationButton} mt-4`}>Try Again</button>
        </div>
      ) : (
        <>
          <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
            {[...messages].reverse().map((message) => {
              const mine = String(message.sender?._id || message.sender) === String(user?.id);
              return (
                <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800'}`}>
                    {!mine && <p className="mb-0.5 text-xs font-semibold text-gray-500">{message.sender?.name || 'Account unavailable'}</p>}
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p className={`mt-1 text-right text-[11px] ${mine ? 'text-indigo-100' : 'text-gray-400'}`}>{formatWhen(message.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">No messages yet. Say hello.</p>
            )}
            <div ref={bottomRef} />
          </div>

          {messagePagination.pages > 1 && (
            <p className="mt-2 text-center text-xs text-gray-500">
              Showing the {messages.length} most recent of {messagePagination.total} messages.
            </p>
          )}

          {sendError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{sendError}</p>}

          <form onSubmit={handleSend} className="mt-3 flex min-w-0 items-end gap-2">
            <label className="sr-only" htmlFor="chat-input">Message</label>
            <textarea
              id="chat-input"
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message…"
              className="min-h-11 w-full min-w-0 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span>
            </button>
          </form>
        </>
      )}
    </div>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Messages</h1>
      <p className="mt-1 text-sm text-gray-500">
        {role === 'agent'
          ? 'Conversations with buyers about your listings.'
          : 'Your conversations with agents.'}
      </p>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={`min-w-0 ${conversationId ? 'hidden lg:block' : ''}`}>{list}</div>
        {conversationId && <div className="min-w-0">{thread}</div>}
        {!conversationId && (
          <div className="hidden min-w-0 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center lg:flex">
            <p className="text-sm text-gray-500">Select a conversation to read and reply.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Messages;