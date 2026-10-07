/**
 * S13 (ADR-035) — Cloudinary provider: signed uploads against the Cloudinary
 * REST API with Node's native fetch — NO SDK dependency (the ADR-024 "one
 * endpoint, zero packages" precedent).
 *
 * Documents upload with access_mode 'authenticated' so they are NEVER
 * deliverable at an unrestricted public URL; delivery happens through the
 * ownership-scoped content route via short-lived signed URLs.
 *
 * Configuration errors throw at CALL time, never at boot, so the rest of
 * the platform keeps serving with a misconfigured provider (ADR-024 rule).
 */
import crypto from 'node:crypto';

const requireConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw {
      status: 502,
      code: 'UPLOAD_PROVIDER_ERROR',
      message: 'Upload provider is not configured',
    };
  }
  return { cloudName, apiKey, apiSecret };
};

const signParams = (params, apiSecret) => {
  // Cloudinary signature: sorted key=value joined with &, api_secret appended, sha1 hex.
  const joined = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${joined}${apiSecret}`).digest('hex');
};

const providerFail = (detail) => {
  throw {
    status: 502,
    code: 'UPLOAD_PROVIDER_ERROR',
    message: `Upload provider request failed${detail ? `: ${detail}` : ''}`,
  };
};

const formWith = (buffer, filename, fields) => {
  const form = new globalThis.FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append('file', new globalThis.Blob([buffer]), filename || 'upload');
  return form;
};

export const cloudinaryProvider = {
  name: 'cloudinary',

  async upload({ buffer, filename, folder, accessMode = 'public' }) {
    const { cloudName, apiKey, apiSecret } = requireConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder, timestamp, api_key: apiKey };
    if (accessMode === 'authenticated') params.access_mode = 'authenticated';
    params.resource_type = 'raw';
    params.signature = signParams(
      Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'api_key')),
      apiSecret,
    );

    let response;
    try {
      response = await globalThis.fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/upload`,
        { method: 'POST', body: formWith(buffer, filename, params) },
      );
    } catch (err) {
      providerFail(err.message);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      providerFail(`HTTP ${response.status} ${text.slice(0, 180)}`);
    }
    const body = await response.json();
    if (!body.public_id) providerFail('missing public_id in response');
    return { providerId: body.public_id, provider: 'cloudinary', url: body.secure_url || null };
  },

  /**
   * Short-lived signed delivery URL. Distribution + signature use the raw
   * resource type; ttl bounds how long the browser may hold the grant.
   */
  async signedUrl(publicId, { ttlSeconds = 300 } = {}) {
    const { cloudName, apiKey, apiSecret } = requireConfig();
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const toSign = `/raw/upload/v1/${expires}/${publicId}`;
    const signature = crypto
      .createHash('sha1')
      .update(`${toSign}${apiSecret}`)
      .digest('hex');
    return (
      `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/raw/upload/` +
      `s--${signature}--/v1/${expires}/${publicId}?api_key=${encodeURIComponent(apiKey)}`
    );
  },

  async destroy(publicId) {
    const { cloudName, apiKey, apiSecret } = requireConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signParams({ public_id: publicId, timestamp }, apiSecret);
    const form = new globalThis.FormData();
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', apiKey);
    form.append('signature', signature);
    const response = await globalThis.fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/destroy`,
      { method: 'POST', body: form },
    ).catch(() => null);
    return { deleted: !!response && response.ok };
  },
};

export default cloudinaryProvider;
