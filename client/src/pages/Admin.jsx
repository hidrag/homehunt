import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { AlertCircle, Building2, CheckCircle2, LayoutDashboard, MessageSquare, Pencil, Plus, Search, CalendarDays, ShieldCheck, Trash2, Users, XCircle } from 'lucide-react';
import adminApi from '../services/adminApi';
import propertyApi from '../services/propertyApi';
import StatusBadge from '../components/ui/StatusBadge';

const PAGE_SIZE = 10;
const TABS = ['overview', 'users', 'listings', 'inquiries', 'visits'];
const ROLES = ['buyer', 'agent', 'admin'];
const PROPERTY_STATUSES = ['available', 'under_offer', 'sold', 'rented'];
const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'condo', 'land'];
const INQUIRY_STATUSES = ['pending', 'responded', 'closed'];
// Admin-usable visit transitions (same table the server enforces for admins).
const VISIT_ACTIONS = {
  pending: { confirmed: 'Confirm visit', declined: 'Decline visit', cancelled: 'Cancel visit' },
  confirmed: { completed: 'Mark completed', cancelled: 'Cancel visit' },
};
const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const formatPrice = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const errorMessage = (err, fallback) => err.response?.data?.error?.message || fallback;
const pageNumber = (value) => Math.max(Number.parseInt(value || '1', 10) || 1, 1);

const provisionSchema = yup.object({
  name: yup.string().trim().required('Name is required').max(120),
  email: yup.string().trim().email('Enter a valid email').required('Email is required').max(254),
  password: yup.string().required('Password is required').min(8).max(72),
  role: yup.string().oneOf(['agent', 'admin']).required(),
});

function LoadState({ loading, error, retry, children }) {
  if (loading) return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-600"><span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />Loading…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"><p>{error}</p><button type="button" onClick={retry} className={`${buttonClass} mt-4`}>Try again</button></div>;
  return children;
}

function EmptyState({ icon: Icon, title, detail }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-12 text-center"><Icon className="mx-auto h-8 w-8 text-gray-400" /><h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3><p className="mt-1 text-sm text-gray-600">{detail}</p></div>;
}

function Pagination({ current, pagination, onChange }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <nav aria-label="Results pagination" className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-700">
    <button type="button" className={buttonClass} disabled={current <= 1} onClick={() => onChange(current - 1)}>Previous</button>
    <span className="px-2" aria-live="polite">Page {current} of {pagination.pages}</span>
    <button type="button" className={buttonClass} disabled={current >= pagination.pages} onClick={() => onChange(current + 1)}>Next</button>
  </nav>;
}

function ProvisionForm({ onSubmit, onCancel, saving }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: yupResolver(provisionSchema), mode: 'onBlur', defaultValues: { name: '', email: '', password: '', role: 'agent' } });
  return <form onSubmit={handleSubmit(onSubmit)} noValidate className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-6">
    <h3 className="text-lg font-semibold text-gray-900">Provision an account</h3>
    <p className="mt-1 text-sm text-gray-600">Create an agent or administrator account. The new user can sign in with the password you provide.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {[
        { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'off' },
        { name: 'password', label: 'Temporary password', type: 'password', autoComplete: 'new-password' },
      ].map((field) => <div key={field.name} className="min-w-0"><label htmlFor={`provision-${field.name}`} className="block text-sm font-medium text-gray-700">{field.label}</label><input id={`provision-${field.name}`} type={field.type} autoComplete={field.autoComplete} className={`${inputClass} mt-1`} aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `provision-${field.name}-error` : undefined} {...register(field.name)} />{errors[field.name] && <p id={`provision-${field.name}-error`} className="mt-1 text-sm text-red-700">{errors[field.name].message}</p>}</div>)}
      <div><label htmlFor="provision-role" className="block text-sm font-medium text-gray-700">Role</label><select id="provision-role" className={`${inputClass} mt-1`} {...register('role')}><option value="agent">Agent</option><option value="admin">Admin</option></select></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-2"><button type="submit" disabled={saving} className={primaryClass}>{saving ? 'Creating…' : 'Create account'}</button><button type="button" disabled={saving} onClick={onCancel} className={buttonClass}>Cancel</button></div>
  </form>;
}

function SearchForm({ value, onSearch, label, placeholder }) {
  return <form key={value} onSubmit={(event) => { event.preventDefault(); onSearch(new FormData(event.currentTarget).get('search').trim()); }} className="flex min-w-0 flex-1 flex-wrap gap-2">
    <label className="sr-only" htmlFor={`search-${label}`}>{label}</label>
    <input id={`search-${label}`} name="search" maxLength={200} defaultValue={value} placeholder={placeholder} className={`${inputClass} min-w-0 flex-1 basis-40`} />
    <button type="submit" className={buttonClass}><Search className="h-4 w-4" />Search</button>
  </form>;
}

const Admin = () => {
  const { user } = useSelector((state) => state.auth);
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const page = pageNumber(params.get('page'));
  const query = params.toString();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState({});
  const [showProvision, setShowProvision] = useState(false);

  const updateParams = (changes, replace = false) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => { if (!value || value === '1') next.delete(key); else next.set(key, String(value)); });
    setParams(next, { replace });
  };
  const filter = (key, value) => updateParams({ [key]: value, page: null });
  const refetch = () => setRevision((value) => value + 1);

  useEffect(() => {
    let cancelled = false;
    const current = new URLSearchParams(query);
    const request = async () => {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        let response;
        if (tab === 'overview') response = await adminApi.getStats();
        if (tab === 'users') response = await adminApi.getUsers({ page, limit: PAGE_SIZE, role: current.get('role') || undefined, search: current.get('search') || undefined });
        if (tab === 'listings') response = await adminApi.getProperties({ page, limit: PAGE_SIZE, search: current.get('search') || undefined, city: current.get('city') || undefined, status: current.get('status') || undefined, listingType: current.get('listingType') || undefined, propertyType: current.get('propertyType') || undefined, agent: current.get('agent') || undefined });
        if (tab === 'inquiries') response = await adminApi.getInquiries({ page, limit: PAGE_SIZE, status: current.get('status') || undefined });
        if (tab === 'visits') response = await adminApi.getVisits({ page, limit: PAGE_SIZE, status: current.get('status') || undefined });
        if (!cancelled) setResult(response.data);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, `Could not load ${tab}. Please try again.`));
      } finally { if (!cancelled) setLoading(false); }
    };
    request();
    return () => { cancelled = true; };
  }, [tab, page, query, revision]);

  const act = async (operation, success) => {
    setBusy(true); setActionError(null); setActionMessage(null);
    try { await operation(); setConfirm(null); setActionMessage(success); refetch(); return true; }
    catch (err) { setActionError(errorMessage(err, 'The action failed. Please try again.')); return false; }
    finally { setBusy(false); }
  };

  const pagination = result?.pagination;
  const items = tab === 'users' ? result?.users : tab === 'listings' ? result?.properties : tab === 'inquiries' ? result?.inquiries : result?.visits;
  useEffect(() => {
    if (loading || error || !pagination || page <= 1 || (items?.length ?? 0) > 0 || pagination.total === 0) return;
    updateParams({ page: String(Math.max(1, pagination.pages)) }, true);
  // Only respond to completed fetches; URL change triggers a new fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, pagination, page, items?.length]);

  return <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-8 rounded-2xl bg-slate-900 p-5 text-white sm:p-8">
      <div className="flex items-start gap-4"><div className="rounded-xl bg-white/10 p-3"><ShieldCheck className="h-6 w-6" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">HomeHunt · Operations</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Admin dashboard</h1><p className="mt-2 break-words text-sm text-slate-300">Signed in as {user?.name}. Manage people, listings and inquiries across the marketplace.</p></div></div>
    </header>
    {actionError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex min-w-0 items-center gap-2 break-words"><AlertCircle className="h-5 w-5 shrink-0" />{actionError}</span><button type="button" className={buttonClass} onClick={() => setActionError(null)}>Dismiss</button></div>}
    {actionMessage && <div role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">{actionMessage}</div>}
    <nav aria-label="Admin sections" className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {[["overview", LayoutDashboard, "Overview"], ["users", Users, "Users"], ["listings", Building2, "Listings"], ["inquiries", MessageSquare, "Inquiries"], ["visits", CalendarDays, "Visits"]].map(([key, Icon, label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => { setConfirm(null); setActionError(null); setActionMessage(null); setParams(key === 'overview' ? {} : { tab: key }); }} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tab === key ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>)}
    </nav>
    {tab === 'users' && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-900">People &amp; access</h2><p className="text-sm text-gray-600">Role changes take effect for existing sessions after access-token expiry or refresh.</p></div><button type="button" className={primaryClass} onClick={() => setShowProvision((value) => !value)}><Plus className="h-4 w-4" />Provision account</button></div>}
    {tab === 'users' && showProvision && <ProvisionForm saving={busy} onCancel={() => setShowProvision(false)} onSubmit={async (values) => { const ok = await act(() => adminApi.provisionUser(values), 'Account created.'); if (ok) setShowProvision(false); }} />}
    {tab === 'users' && <div className="mb-5 flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><SearchForm label="users" placeholder="Search name or email" value={params.get('search') || ''} onSearch={(value) => filter('search', value)} /><label className="min-w-36 flex-1 text-sm font-medium text-gray-700 sm:flex-none">Role<select aria-label="Filter users by role" value={params.get('role') || ''} onChange={(event) => filter('role', event.target.value)} className={`${inputClass} mt-1`}><option value="">All roles</option>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label></div>}
    {tab === 'listings' && <><div className="mb-5"><h2 className="text-xl font-bold text-gray-900">Marketplace listings</h2><p className="text-sm text-gray-600">Edit details or remove a listing. Status changes and approvals are not available in S7.</p></div><div className="mb-5 grid min-w-0 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><div className="sm:col-span-2 lg:col-span-4"><SearchForm label="listings" placeholder="Search title, description or city" value={params.get('search') || ''} onSearch={(value) => filter('search', value)} /></div><label className="text-sm font-medium text-gray-700">City<input className={`${inputClass} mt-1`} value={params.get('city') || ''} onChange={(event) => filter('city', event.target.value)} maxLength={100} placeholder="All cities" /></label>{[['status', 'Status', PROPERTY_STATUSES], ['listingType', 'Listing type', ['sale', 'rent']], ['propertyType', 'Property type', PROPERTY_TYPES]].map(([key, label, options]) => <label key={key} className="text-sm font-medium text-gray-700">{label}<select className={`${inputClass} mt-1`} value={params.get(key) || ''} onChange={(event) => filter(key, event.target.value)}><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>)}<label className="text-sm font-medium text-gray-700 sm:col-span-2">Agent ID<input className={`${inputClass} mt-1`} value={params.get('agent') || ''} onChange={(event) => filter('agent', event.target.value)} placeholder="Filter by agent ID" /></label></div></>}
    {tab === 'inquiries' && <><div className="mb-5"><h2 className="text-xl font-bold text-gray-900">All inquiries</h2><p className="text-sm text-gray-600">Review and manage conversations across agents.</p></div><label className="mb-5 block max-w-xs text-sm font-medium text-gray-700">Status<select className={`${inputClass} mt-1`} value={params.get('status') || ''} onChange={(event) => filter('status', event.target.value)}><option value="">All statuses</option>{INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></>}
    {tab === 'visits' && <><div className="mb-5"><h2 className="text-xl font-bold text-gray-900">All visits</h2><p className="text-sm text-gray-600">Manage scheduled visits across agents and buyers.</p></div><label className="mb-5 block max-w-xs text-sm font-medium text-gray-700">Status<select className={`${inputClass} mt-1`} value={params.get('status') || ''} onChange={(event) => filter('status', event.target.value)}><option value="">All statuses</option>{['pending','confirmed','declined','cancelled','completed'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label></>}
    <LoadState loading={loading} error={error} retry={refetch}>
      {tab === 'overview' && result && <><h2 className="mb-4 text-xl font-bold text-gray-900">At a glance</h2><div className="grid gap-4 sm:grid-cols-3">{[["People", result.users?.total, Users, `Buyers ${result.users?.byRole?.buyer ?? 0} · Agents ${result.users?.byRole?.agent ?? 0} · Admins ${result.users?.byRole?.admin ?? 0}`], ["Listings", result.properties?.total, Building2, `Available ${result.properties?.byStatus?.available ?? 0} · Sale ${result.properties?.byListingType?.sale ?? 0} · Rent ${result.properties?.byListingType?.rent ?? 0}`], ["Inquiries", result.inquiries?.total, MessageSquare, `Pending ${result.inquiries?.byStatus?.pending ?? 0} · Responded ${result.inquiries?.byStatus?.responded ?? 0} · Closed ${result.inquiries?.byStatus?.closed ?? 0}`]].map(([label, count, Icon, description]) => <article key={label} className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-indigo-600" /><h3 className="mt-3 text-sm font-medium text-gray-600">{label}</h3><p className="text-3xl font-bold text-gray-900">{count ?? 0}</p><p className="mt-2 text-sm leading-6 text-gray-600">{description}</p></article>)}</div><div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5"><h3 className="mb-4 font-semibold text-gray-900">Recent listings</h3>{result.recentProperties?.length ? <ul className="divide-y divide-gray-100">{result.recentProperties.map((item) => <li key={item._id} className="flex min-w-0 flex-wrap justify-between gap-2 py-3 text-sm"><Link className="min-w-0 break-words font-medium text-indigo-700 hover:underline" to={`/listings/${item._id}`}>{item.title}</Link><StatusBadge status={item.status} /></li>)}</ul> : <p className="text-sm text-gray-600">No listings yet.</p>}</section><section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5"><h3 className="mb-4 font-semibold text-gray-900">Recent inquiries</h3>{result.recentInquiries?.length ? <ul className="divide-y divide-gray-100">{result.recentInquiries.map((item) => <li key={item._id} className="flex min-w-0 flex-wrap justify-between gap-2 py-3 text-sm"><span className="min-w-0 break-words"><strong>{item.name}</strong> · {item.property?.title || 'Listing no longer available'}</span><StatusBadge status={item.status} /></li>)}</ul> : <p className="text-sm text-gray-600">No inquiries yet.</p>}</section></div></>}
      {tab === 'users' && result && (result.users.length ? <div className="space-y-3">{result.users.map((entry) => <article key={entry.id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-gray-900">{entry.name} {entry.id === user?.id && <span className="text-sm font-normal text-gray-500">(you)</span>}</h3><p className="break-all text-sm text-gray-600">{entry.email}</p><p className="mt-1 text-xs text-gray-500">Joined {formatDate(entry.createdAt)}</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase text-indigo-800">{entry.role}</span></div>{entry.id !== user?.id && <div className="mt-4 flex flex-wrap items-end gap-2"><label className="min-w-36 flex-1 text-sm font-medium text-gray-700 sm:flex-none">Change role<select aria-label={`New role for ${entry.name}`} className={`${inputClass} mt-1`} value={selectedRoles[entry.id] || entry.role} onChange={(event) => { setSelectedRoles((prev) => ({ ...prev, [entry.id]: event.target.value })); setConfirm(null); }} disabled={busy}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" className={buttonClass} disabled={busy || (selectedRoles[entry.id] || entry.role) === entry.role} onClick={() => setConfirm({ kind: 'role', id: entry.id, name: entry.name, role: selectedRoles[entry.id] })}>Review change</button></div>}{confirm?.kind === 'role' && confirm.id === entry.id && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-800"><p>Change {entry.name} from {entry.role} to <strong>{confirm.role}</strong>? Existing access tokens may retain the prior role for up to 15 minutes.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={busy} onClick={() => act(() => adminApi.changeUserRole(entry.id, confirm.role), 'Role updated.')}>{busy ? 'Saving…' : 'Confirm role change'}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div></div>}</article>)}</div> : <EmptyState icon={Users} title="No users found" detail="Try a different search or role filter." />)}
      {tab === 'listings' && result && (result.properties.length ? <div className="space-y-3">{result.properties.map((listing) => <article key={listing._id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><Link to={`/listings/${listing._id}`} className="break-words font-semibold text-gray-900 hover:text-indigo-700 hover:underline">{listing.title}</Link><p className="mt-1 break-words text-sm text-gray-600">{listing.address?.city || 'City unavailable'} · {formatPrice(listing.price)} · {listing.listingType}</p><p className="mt-2 break-words text-sm text-gray-600">Agent: {listing.agent?.name || 'Account unavailable'} {listing.agent?.email && <span className="break-all">({listing.agent.email})</span>}</p></div><StatusBadge status={listing.status} /></div><div className="mt-4 flex flex-wrap gap-2"><Link className={buttonClass} to={`/agent/listings/${listing._id}/edit`} state={{ fromAdmin: `/admin?${params.toString()}` }}><Pencil className="h-4 w-4" />Edit</Link><button type="button" className={`${buttonClass} text-red-700`} disabled={busy} onClick={() => setConfirm({ kind: 'delete', id: listing._id, name: listing.title })}><Trash2 className="h-4 w-4" />Delete</button></div>{confirm?.kind === 'delete' && confirm.id === listing._id && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>Delete <strong>{listing.title}</strong>? This cannot be undone. Bookmarks will be removed; inquiries remain as records.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" disabled={busy} onClick={() => act(() => propertyApi.deleteProperty(listing._id), 'Listing deleted.')}>{busy ? 'Deleting…' : 'Confirm deletion'}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div></div>}</article>)}</div> : <EmptyState icon={Building2} title="No listings found" detail="Try different search or filter settings." />)}
      {tab === 'inquiries' && result && (result.inquiries.length ? <div className="space-y-3">{result.inquiries.map((inquiry) => <article key={inquiry._id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold text-gray-900">{inquiry.property ? <Link to={`/listings/${inquiry.property._id}`} className="hover:text-indigo-700 hover:underline">{inquiry.property.title}</Link> : 'Listing no longer available'}</h3><p className="mt-1 text-sm text-gray-500">{formatDate(inquiry.createdAt)}</p></div><StatusBadge status={inquiry.status} /></div><div className="mt-4 grid min-w-0 gap-2 text-sm text-gray-700 sm:grid-cols-2"><p className="min-w-0 break-words"><strong>Buyer:</strong> {inquiry.buyer?.name || inquiry.name || 'Account unavailable'} <span className="break-all">({inquiry.buyer?.email || inquiry.email})</span></p><p className="min-w-0 break-words"><strong>Agent:</strong> {inquiry.agent?.name || 'Account unavailable'} {inquiry.agent?.email && <span className="break-all">({inquiry.agent.email})</span>}</p></div><p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{inquiry.message}</p>{inquiry.status !== 'closed' && <div className="mt-4 flex flex-wrap gap-2">{inquiry.status === 'pending' && <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm({ kind: 'inquiry', id: inquiry._id, status: 'responded' })}><CheckCircle2 className="h-4 w-4" />Mark responded</button>}<button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm({ kind: 'inquiry', id: inquiry._id, status: 'closed' })}><XCircle className="h-4 w-4" />Close inquiry</button></div>}{confirm?.kind === 'inquiry' && confirm.id === inquiry._id && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-800"><p>Mark this inquiry as <strong>{confirm.status}</strong>?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={busy} onClick={() => act(() => adminApi.updateInquiryStatus(inquiry._id, confirm.status), 'Inquiry updated.')}>{busy ? 'Saving…' : 'Confirm status change'}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div></div>}</article>)}</div> : <EmptyState icon={MessageSquare} title="No inquiries found" detail="No inquiries match the selected status." />)}
      {tab === 'visits' && result && (result.visits.length ? <div className="space-y-3">{result.visits.map((visit) => <article key={visit._id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-semibold text-gray-900">{visit.property ? <Link to={`/listings/${visit.property._id}`} className="hover:text-indigo-700 hover:underline">{visit.property.title}</Link> : 'Listing no longer available'}</h3><p className="mt-1 text-sm text-gray-500">{formatDateTime(visit.startAt)} · {visit.timezone}</p></div><StatusBadge status={visit.status} /></div><div className="mt-4 grid min-w-0 gap-2 text-sm text-gray-700 sm:grid-cols-2"><p className="min-w-0 break-words"><strong>Buyer:</strong> {visit.buyer?.name || 'Account unavailable'} {visit.buyer?.email && <span className="break-all">({visit.buyer.email})</span>}</p><p className="min-w-0 break-words"><strong>Agent:</strong> {visit.agent?.name || 'Account unavailable'} {visit.agent?.email && <span className="break-all">({visit.agent.email})</span>}</p></div>{visit.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{visit.note}</p>}{VISIT_ACTIONS[visit.status] && <div className="mt-4 flex flex-wrap gap-2">{Object.entries(VISIT_ACTIONS[visit.status]).map(([nextStatus, label]) => <button key={nextStatus} type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm({ kind: 'visit', id: visit._id, status: nextStatus, label })}>{label}</button>)}</div>}{confirm?.kind === 'visit' && confirm.id === visit._id && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-800"><p>{confirm.label}? The buyer and agent are notified where notification rules apply.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={busy} onClick={() => act(() => adminApi.updateVisitStatus(visit._id, confirm.status), 'Visit updated.')}>{busy ? 'Saving…' : 'Confirm'}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div></div>}</article>)}</div> : <EmptyState icon={CalendarDays} title="No visits found" detail="No visits match the selected status." />)}
      {tab !== 'overview' && <Pagination current={page} pagination={pagination} onChange={(next) => { setConfirm(null); updateParams({ page: next }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
    </LoadState>
  </main>;
};

export default Admin;
