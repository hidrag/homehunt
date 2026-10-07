import { escapeHtml } from './email/visit.templates.js';

const sentEmails = [];
let failure = false;

export const fakeEmailProvider = {
  sentEmails,
  setFailure(value) { failure = value; },
  clear() { sentEmails.length = 0; failure = false; },
  async send(message) { if (failure) throw new Error('configured fake email failure'); sentEmails.push(message); },
};

const template = (event, visit) => {
  const title = escapeHtml(visit.property?.title || 'Listing no longer available');
  const note = visit.note ? `<p>Note: ${escapeHtml(visit.note)}</p>` : '';
  const subject = { requested: 'Visit request received', confirmed: 'Visit confirmed', declined: 'Visit declined', buyer_cancelled: 'Visit cancelled', agent_cancelled: 'Visit cancelled' }[event] || 'Visit update';
  return { subject, html: `<h1>${subject}</h1><p>${title}</p><p>${new Date(visit.startAt).toISOString()} to ${new Date(visit.endAt).toISOString()}</p>${note}` };
};

/**
 * Single dispatch seam (ADR-024): Resend in production, fake provider in
 * tests. Used by both visit transactional email and S10 notification email.
 */
const dispatch = async ({ to, event, subject, html }) => {
  const message = { to, event, subject, html };
  if ((process.env.EMAIL_PROVIDER || 'fake') === 'resend') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Resend email configuration is incomplete');
    const bearer = 'Bearer' + ' ' + process.env.RESEND_API_KEY;
    const response = await globalThis.fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }) });
    if (!response.ok) throw new Error(`Resend returned ${response.status}`);
    return;
  }
  await fakeEmailProvider.send(message);
};

/** S8 visit transactional email (unchanged contract). */
export const sendEmail = async ({ to, event, visit }) => {
  const content = template(event, visit);
  await dispatch({ to, event, subject: content.subject, html: content.html });
};

/**
 * S10 notification email (ADR-030): `listing_match` and `inquiry_update`
 * only. Caller supplies template text; failures propagate to the caller's
 * guarded fire-and-forget wrapper, never to the primary mutation.
 */
export const sendNotificationEmail = async ({ to, event, subject, html }) => dispatch({ to, event, subject, html });
