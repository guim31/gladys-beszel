// -----------------------------------------------------------------------------
// An in-memory Beszel hub on a fake network, served from the real answers of
// a Beszel 0.21.0 hub (test/fixtures/beszel/): one system up (an agent in
// Docker, with temperature sensors), one down, and four alerts of the user,
// CPU triggered. The tests change what it answers (a system down, an alert
// triggered, a token expired, the hub down) and the integration reads it
// through the very same client.
//
// Like PocketBase, a list read with a wrong or expired token answers 200 and
// an empty list.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HUB_URL = 'http://192.0.2.10:8090';
export const EMAIL = 'gladys@example.com';
export const PASSWORD = 'test-password-not-a-secret';
export const SYSTEM_UP = 'knkkkk3pt4sepf9';
export const SYSTEM_DOWN = '31asvrl7j1f024u';
export const ALERT_CPU = 'sh0t26uc40uy7jx';
export const ALERT_MEMORY = 'cs57tt6osbgjas6';
export const ALERT_STATUS = 'urmrwpej7qzcq7n';

export const readFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/beszel/${name}`, import.meta.url), 'utf8'));

const response = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const pbError = (status, message) => response(status, { data: {}, message, status });

/** A PocketBase-like token expiring at `expMs`. */
export function makeToken(expMs, serial) {
  const part = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ exp: Math.floor(expMs / 1000), serial })}.sig`;
}

export class FakeBeszel {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now] clock of the token expiry
   * @param {string} [options.role] role of the user
   */
  constructor({ now = () => Date.now(), role = 'user' } = {}) {
    this.now = now;
    this.role = role;
    this.password = PASSWORD;
    this.systems = readFixture('systems.json').items;
    this.alerts = readFixture('alerts.json').items;
    this.tokenLifetimeMs = 7 * 24 * 3600_000;
    this.tokens = new Map(); // token -> expiry
    this.serial = 0;
    /** null, 'down', 'html', 'proxy', 'redirect' */
    this.failure = null;
    this.requests = [];
  }

  system(id) {
    return this.systems.find((system) => system.id === id);
  }

  alert(id) {
    return this.alerts.find((alert) => alert.id === id);
  }

  /** Mark a system down or up, the way the hub does (zeroed info when down). */
  setStatus(id, status) {
    const system = this.system(id);
    system.status = status;
    if (status !== 'up') {
      system.info = { ...system.info, cpu: 0, mp: 0, dp: 0, bb: 0, u: 0, v: '', la: [0, 0, 0] };
      delete system.info.dt;
    } else {
      system.info = readFixture('systems.json').items[0].info;
    }
  }

  setTriggered(id, triggered) {
    this.alert(id).triggered = triggered;
  }

  /** Every token issued so far stops working (password changed, hub restarted with a new secret). */
  revokeTokens() {
    this.tokens.clear();
  }

  issue() {
    this.serial += 1;
    const expiry = this.now() + this.tokenLifetimeMs;
    const token = makeToken(expiry, this.serial);
    this.tokens.set(token, expiry);
    const record = readFixture('auth-with-password.json').record;
    return { record: { ...record, role: this.role }, token };
  }

  valid(token) {
    const expiry = this.tokens.get(token);
    return expiry !== undefined && expiry > this.now();
  }

  handle(url, { method = 'GET', headers = {}, body } = {}) {
    this.requests.push({ method, url, headers, body });
    if (this.failure === 'down') {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.failure === 'proxy') {
      return { status: 502, headers: {}, body: '<html>Bad gateway</html>' };
    }
    if (this.failure === 'html') {
      return { status: 200, headers: {}, body: '<!doctype html><html></html>' };
    }
    if (this.failure === 'redirect') {
      return { status: 301, headers: { location: 'https://beszel.example.com/' }, body: '' };
    }
    const target = new URL(url);
    const path = target.pathname;
    const token = headers.authorization;
    if (method === 'POST' && path === '/api/collections/users/auth-with-password') {
      const sent = JSON.parse(body);
      if (sent.identity !== EMAIL || sent.password !== this.password) {
        return response(400, readFixture('auth-failed.json'));
      }
      return response(200, this.issue());
    }
    if (method === 'POST' && path === '/api/collections/users/auth-refresh') {
      if (!this.valid(token)) {
        return pbError(401, 'The request requires valid record authorization token.');
      }
      return response(200, this.issue());
    }
    if (method === 'GET' && path === '/api/beszel/getkey') {
      if (!this.valid(token)) {
        return pbError(401, 'The request requires valid record authorization token.');
      }
      return response(200, readFixture('getkey.json'));
    }
    const list = path.match(/^\/api\/collections\/(systems|alerts)\/records$/);
    if (method === 'GET' && list) {
      const page = Number(target.searchParams.get('page') ?? 1);
      const perPage = Number(target.searchParams.get('perPage') ?? 30);
      // PocketBase: a wrong token sees nothing, without an error.
      const all = this.valid(token) ? (list[1] === 'systems' ? this.systems : this.alerts) : [];
      const items = all.slice((page - 1) * perPage, page * perPage);
      return response(200, { items, page, perPage, totalItems: -1, totalPages: -1 });
    }
    return pbError(404, 'The requested resource wasn’t found.');
  }
}

/** The fake network: one hub per base URL, anything else refuses the connection. */
export function createNetwork(hubs) {
  const calls = [];
  return {
    calls,
    async request(url, options = {}) {
      calls.push(url);
      for (const [base, hub] of Object.entries(hubs)) {
        if (url.startsWith(`${base}/`)) {
          return hub.handle(url, options);
        }
      }
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  };
}
