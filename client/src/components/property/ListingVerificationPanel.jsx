import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Upload, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import propertyApi from '../../services/propertyApi';
import VerificationBadge from '../ui/VerificationBadge';

const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';
const buttonClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const primaryClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * S13 (ADR-036) — agent-side verification document panel.
 *
 * Owner-scoped: lists active documents, uploads new ones (server enforces
 * magic-byte + size limits), soft-deletes, and submits the listing for
 * verification (requires >= 1 active document — the server is the authority
 * and its error is surfaced verbatim).
 */
const ListingVerificationPanel = ({ propertyId, status, rejectionReason, onChanged }) => {
  const [documents, setDocuments] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await propertyApi.getDocuments(propertyId);
      setDocuments(result?.data?.documents || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not load documents.');
    }
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (operation, success) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(err.response?.data?.error?.message || 'The action failed. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    run(() => propertyApi.uploadDocuments(propertyId, files), 'Documents uploaded.');
  };

  const canSubmit = status === 'unverified' || status === 'rejected' || status === 'verified';

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-gray-900">Verification documents</h4>
          <VerificationBadge status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${buttonClass} cursor-pointer`}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Upload</span>
            <input
              type="file"
              className="sr-only"
              accept={DOC_ACCEPT}
              multiple
              disabled={busy}
              onChange={handleUpload}
              aria-label="Upload verification documents"
            />
          </label>
          {canSubmit && (
            <button
              type="button"
              className={primaryClass}
              disabled={busy || (documents?.length ?? 0) === 0}
              title={documents?.length ? 'Submit for admin review' : 'Upload at least one document first'}
              onClick={() => run(() => propertyApi.requestVerification(propertyId), 'Submitted for verification.')}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{status === 'verified' ? 'Re-request verification' : 'Request verification'}</span>
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        PDF, JPEG, PNG or WebP. Up to 10 active files, 10 MB each. Documents are private — only you and
        platform admins can open them.
      </p>

      {rejectionReason && status === 'rejected' && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Rejected: {rejectionReason}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs text-green-700">
          {notice}
        </p>
      )}

      {documents === null ? (
        <p className="mt-3 text-xs text-gray-500">Loading documents…</p>
      ) : documents.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">No documents uploaded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-800" title={doc.fileName}>
                {doc.fileName}
              </span>
              <span className="text-xs text-gray-500">{formatBytes(doc.byteSize)}</span>
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-red-200 px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => run(() => propertyApi.deleteDocument(propertyId, doc.id), 'Document removed.')}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ListingVerificationPanel;
