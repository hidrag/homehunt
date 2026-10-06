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

export const sendEmail = async ({ to, event, visit }) => {
  const content = template(event, visit);
  const message = { to, event, ...content };
  if ((process.env.EMAIL_PROVIDER || 'fake') === 'resend') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Resend email configuration is incomplete');
    const response = await globalThis.fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: content.subject, html: content.html }) });
    if (!response.ok) throw new Error(`Resend returned ${response.status}`);
    return;
  }
  await fakeEmailProvider.send(message);
};
