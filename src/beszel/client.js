// -----------------------------------------------------------------------------
// Beszel client: the PocketBase REST API of the Beszel hub (port 8090), read
// with the account of one Beszel user:
//
//   POST /api/collections/users/auth-with-password   email + password -> token
//   POST /api/collections/users/auth-refresh         a fresh token (same user)
//   GET  /api/collections/systems/records            the systems of the user:
//                                                    status and `info` summary
//   GET  /api/collections/alerts/records             the alerts of the user,
//                                                    with `triggered`
//
// Read only: nothing here changes the hub. The token lives in memory only and
// never reaches a log line or a message.
//
// A PocketBase trap, checked on a real hub (Beszel 0.21.0): a list request
// with an expired or invalid token is NOT refused, it answers 200 with an
// empty list (the rules simply match nothing). An empty answer is therefore
// checked with auth-refresh before it is believed (src/hub.js).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: off, wrong address, firewall, hub stopped
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // email or password refused
  CREDENTIALS_MISSING: 'credentials_missing', // no email or password configured
  NOT_BESZEL: 'not_beszel', // something answers, not the API of a Beszel hub
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class BeszelError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'BeszelError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// A token is renewed this long before it expires (PocketBase: 7 days by
// default, `exp` of the JWT).
export const RENEW_BEFORE_MS = 24 * 3600_000;

// Records per page: PocketBase accepts up to 1000.
const PER_PAGE = 500;
const MAX_PAGES = 4;

export const SYSTEM_FIELDS = 'id,name,status,info,updated';
export const ALERT_FIELDS = 'id,system,name,value,min,triggered';

/** The expiry of a PocketBase token (JWT `exp`, in ms), null when unreadable. */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class BeszelClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.email
   * @param {string} options.password
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {() => number} [options.now]
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    email,
    password,
    insecure = false,
    request = httpRequest,
    now = () => Date.now(),
    timeoutMs = 15_000,
  }) {
    this.url = url;
    this.email = email;
    this.password = password;
    this.insecure = insecure;
    this.request = request;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.token = null;
    this.expiresAt = 0;
    this.version = null;
    this.role = null;
  }

  /**
   * One request. Resolves the parsed JSON of a 2xx answer, throws a
   * BeszelError for everything else.
   */
  async call(path, { method = 'GET', body, token = this.token } = {}) {
    const headers = { accept: 'application/json' };
    if (token) {
      headers.authorization = token;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new BeszelError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      if (err.code === 'ERESPONSETOOLARGE') {
        throw new BeszelError(ERROR_KINDS.HTTP, 'Answer too large');
      }
      throw new BeszelError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status } = response;
    if ([301, 302, 307, 308].includes(status)) {
      throw new BeszelError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    // A reverse proxy in front of a stopped hub.
    if ([502, 503, 504].includes(status)) {
      throw new BeszelError(ERROR_KINDS.UNREACHABLE, `HTTP ${status} from a proxy`, { status });
    }
    let data = null;
    try {
      data = JSON.parse(response.body);
    } catch {
      // Not JSON: the web page of something else, or of a proxy.
    }
    if (status >= 200 && status < 300) {
      if (!data || typeof data !== 'object') {
        throw new BeszelError(ERROR_KINDS.NOT_BESZEL, `HTTP ${status} without JSON`, { status });
      }
      return data;
    }
    // A PocketBase error is JSON `{ status, message, data }`; anything else at
    // these paths is not a Beszel hub.
    if (!data || typeof data.message !== 'string') {
      throw new BeszelError(ERROR_KINDS.NOT_BESZEL, `HTTP ${status}, not PocketBase`, { status });
    }
    if (status === 400 || status === 401 || status === 403) {
      throw new BeszelError(ERROR_KINDS.AUTH, `HTTP ${status}: ${data.message}`, { status });
    }
    throw new BeszelError(ERROR_KINDS.HTTP, `HTTP ${status}: ${data.message}`, { status });
  }

  /** The version of the hub, null when it does not say (best effort, after login). */
  async info() {
    try {
      const data = await this.call('/api/beszel/getkey');
      if (typeof data.v === 'string' && data.v) {
        this.version = data.v;
      }
    } catch {
      // An older hub, or a proxy that hides it: the version is only shown.
    }
    return this.version;
  }

  async login() {
    if (!this.email || !this.password) {
      throw new BeszelError(ERROR_KINDS.CREDENTIALS_MISSING, 'Email or password missing');
    }
    let data;
    try {
      data = await this.call('/api/collections/users/auth-with-password', {
        method: 'POST',
        body: { identity: this.email, password: this.password },
        token: null,
      });
    } catch (err) {
      // 404 JSON: PocketBase without a `users` collection, not Beszel.
      if (err.kind === ERROR_KINDS.HTTP && err.status === 404) {
        throw new BeszelError(ERROR_KINDS.NOT_BESZEL, 'No users collection', { status: 404 });
      }
      throw err;
    }
    this.accept(data);
  }

  accept(data) {
    if (typeof data?.token !== 'string' || !data.token) {
      throw new BeszelError(ERROR_KINDS.NOT_BESZEL, 'Authentication answer without token');
    }
    this.token = data.token;
    this.expiresAt = tokenExpiry(data.token) ?? this.now() + RENEW_BEFORE_MS * 2;
    this.role = typeof data.record?.role === 'string' ? data.record.role : null;
  }

  /** A valid token: logs in when there is none, renews it before it expires. */
  async ensureToken() {
    if (!this.token) {
      await this.login();
      return;
    }
    if (this.expiresAt - this.now() < RENEW_BEFORE_MS) {
      await this.verify();
    }
  }

  /**
   * Renew the token (auth-refresh); log in again when it is refused. Also
   * the way to tell a real empty list from one answered to a dead token.
   */
  async verify() {
    try {
      this.accept(await this.call('/api/collections/users/auth-refresh', { method: 'POST' }));
    } catch (err) {
      if (err.kind !== ERROR_KINDS.AUTH) {
        throw err;
      }
      this.token = null;
      await this.login();
    }
  }

  /** Every record of a collection the user can list (a few pages at most). */
  async list(collection, fields) {
    await this.ensureToken();
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        page: String(page),
        perPage: String(PER_PAGE),
        skipTotal: '1',
        fields,
      });
      let data;
      try {
        data = await this.call(`/api/collections/${collection}/records?${query}`);
      } catch (err) {
        if (err.kind !== ERROR_KINDS.AUTH || page > 1) {
          throw err;
        }
        // The token was revoked (password changed): once more with a new one.
        this.token = null;
        await this.login();
        data = await this.call(`/api/collections/${collection}/records?${query}`);
      }
      if (!Array.isArray(data.items)) {
        throw new BeszelError(ERROR_KINDS.NOT_BESZEL, `${collection}: answer without items`);
      }
      items.push(...data.items);
      if (data.items.length < PER_PAGE) {
        break;
      }
    }
    return items;
  }

  systems() {
    return this.list('systems', SYSTEM_FIELDS);
  }

  alerts() {
    return this.list('alerts', ALERT_FIELDS);
  }
}
