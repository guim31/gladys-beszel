// -----------------------------------------------------------------------------
// The pure parts: the address typed by the user, the `info` summary of a
// system (real answers of Beszel 0.21.0, and the older `b` field), the token
// expiry, and the errors of the client.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseHubUrl } from '../src/config.js';
import { BeszelClient, ERROR_KINDS, tokenExpiry } from '../src/beszel/client.js';
import { parseAlerts, parseInfo, parseSystems } from '../src/beszel/model.js';
import { makeToken, readFixture } from './helpers/fakeBeszel.js';

test('the hub address: bare host, host:port, a URL copied from the browser', () => {
  assert.equal(parseHubUrl('192.0.2.10'), 'http://192.0.2.10:8090');
  assert.equal(parseHubUrl(' nas.lan:9000 '), 'http://nas.lan:9000');
  assert.equal(parseHubUrl('https://beszel.example.com/'), 'https://beszel.example.com');
  assert.equal(parseHubUrl('http://nas.lan:8090/system/agent-one'), 'http://nas.lan:8090');
  assert.equal(parseHubUrl('https://example.com/beszel/_/'), 'https://example.com/beszel');
  assert.equal(parseHubUrl('http://nas.lan:8090/api/'), 'http://nas.lan:8090');
  assert.equal(parseHubUrl('ftp://nas.lan'), null);
  assert.equal(parseHubUrl('http://user:pass@nas.lan'), null);
  assert.equal(parseHubUrl(''), null);
});

test('the configuration: defaults, a password kept as typed', () => {
  const config = normalizeConfig({ hub_url: 'nas', password: ' p ', poll_interval: '7' });
  assert.equal(config.url, 'http://nas:8090');
  assert.equal(config.password, ' p ');
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ hub_url: 'ftp://x' }).invalidUrl, true);
});

test('the info of a real system up, and of a real system down', () => {
  const [up, down] = parseSystems(readFixture('systems.json').items);
  assert.deepEqual(up.info, {
    cpu: 48.22,
    memory: 56.47,
    disk: 80.44,
    temperature: 95,
    networkMbps: 0.000904,
    load: [5.84, 4.99, 2.93],
    uptime: 670120,
    failedServices: null,
    agentVersion: '0.21.0',
  });
  assert.equal(down.status, 'down');
  assert.equal(down.info, null, 'the zeroed info of a down system is not read');
});

test('an older agent (`b` in MB/s), no sensor, systemd services', () => {
  const info = parseInfo({ cpu: 5, mp: 10, dp: 20, b: 1.5, dt: 0, sv: [40, 2], u: 60 });
  assert.equal(info.networkMbps, (1.5 * 1024 * 1024 * 8) / 1e6);
  assert.equal(info.temperature, null);
  assert.equal(info.failedServices, 2);
  assert.equal(info.load, null);
});

test('the alerts, grouped by system and in the order of Beszel', () => {
  const alerts = parseAlerts(readFixture('alerts.json').items);
  assert.deepEqual(
    alerts.get('knkkkk3pt4sepf9').map((alert) => [alert.name, alert.triggered]),
    [
      ['Status', false],
      ['CPU', true],
      ['Memory', false],
    ],
  );
  assert.equal(alerts.get('31asvrl7j1f024u').length, 1);
});

test('the expiry of a PocketBase token', () => {
  assert.equal(tokenExpiry(makeToken(1_792_590_058_000, 1)), 1_792_590_058_000);
  assert.equal(tokenExpiry('not-a-token'), null);
});

test('the client tells apart a web page, a PocketBase without users, a TLS error', async () => {
  const answer = (status, body) => async () => ({ status, headers: {}, body });
  const client = (request) =>
    new BeszelClient({ url: 'http://192.0.2.10:8090', email: 'a@b.c', password: 'p', request });
  await assert.rejects(client(answer(404, '<html></html>')).login(), {
    kind: ERROR_KINDS.NOT_BESZEL,
  });
  await assert.rejects(
    client(answer(404, JSON.stringify({ status: 404, message: 'Missing collection' }))).login(),
    { kind: ERROR_KINDS.NOT_BESZEL },
  );
  await assert.rejects(
    client(async () => {
      throw Object.assign(new Error('self-signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    }).login(),
    { kind: ERROR_KINDS.TLS },
  );
  await assert.rejects(new BeszelClient({ url: 'http://x', email: '', password: '' }).login(), {
    kind: ERROR_KINDS.CREDENTIALS_MISSING,
  });
});

test('an alert in words: above, below for a battery, no threshold when binary', async () => {
  const { alertText } = await import('../src/texts.js');
  const alert = (name, threshold, monitor = null) => ({ name, threshold, monitor });
  assert.equal(alertText(alert('CPU', 80), 'en'), 'CPU > 80%');
  assert.equal(alertText(alert('Battery', 20), 'fr'), 'Batterie < 20 %');
  assert.equal(alertText(alert('SystemdFailed', 0), 'en'), 'Failed services');
  assert.equal(alertText(alert('ContainerHealth', 3), 'de'), 'Container-Zustand');
  assert.equal(
    alertText(alert('NetworkMonitorLoss', 5, 'router'), 'en'),
    'Network monitor loss > 5% (router)',
  );
});
