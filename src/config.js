// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Beszel hub, read with the email and password of one of its users: the
// integration sees the systems and the alerts of that user, nothing more.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Port of the Beszel hub web server.
export const DEFAULT_PORT = 8090;

// Refresh intervals offered in the configuration, in seconds. The hub itself
// reads its agents once a minute.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  hub_url: '',
  email: '',
  password: '',
  poll_interval: '30',
  allow_self_signed: false,
  language: 'fr',
};

// What follows the root of the hub in a URL copied from the browser: the
// client adds `/api/...` on its own.
const INTERFACE_PATH = /\/(api(\/.*)?|_(\/.*)?|system\/.*|settings(\/.*)?)$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 8090 added), `host:port`, or the URL copied from the
 * browser (`http://nas.lan:8090/system/nas`). HTTP by default. A path is kept
 * (Beszel served under a sub-path, `BASE_PATH`); the API and page paths are
 * dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseHubUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the messages.
  if (url.username || url.password) {
    return null;
  }
  if (!hasScheme && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme, no default port). */
export const hostOf = (url) =>
  url.replace(/^https?:\/\//, '').replace(new RegExp(`:${DEFAULT_PORT}(?=/|$)`), '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('hub_url');
  const url = typed ? parseHubUrl(typed) : null;
  return {
    url,
    invalidUrl: Boolean(typed) && !url,
    email: text('email'),
    // A password may begin or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    allowSelfSigned: source.allow_self_signed === true || source.allow_self_signed === 'true',
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
