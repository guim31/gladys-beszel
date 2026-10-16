// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the fake
// Beszel hub served from real answers: discovery, states, status and alert
// transitions, tokens, errors, the widget and the scene actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { TRIGGERS } from '../src/hub.js';
import {
  ALERT_CPU,
  ALERT_MEMORY,
  CONFIG,
  FakeBeszel,
  SYSTEM_DOWN,
  SYSTEM_UP,
  createClock,
  createDevices,
  createWorld,
  featureId,
  systemId,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const lastState = (world, id, feature) =>
  world.fake.lastState(featureId(world.gladys, id, feature));
const paths = (world) => world.beszel.requests.map((request) => new URL(request.url).pathname);

async function started(t, options = {}) {
  const world = await createWorld({ clock: createClock(), ...options });
  t.after(() => world.app.stop());
  return world;
}

test('every system of the user is proposed, read with two list requests', async (t) => {
  const world = await started(t);
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => [device.name, device.external_id]),
    [
      ['agent-one', systemId(world.gladys, SYSTEM_UP)],
      ['ghost', systemId(world.gladys, SYSTEM_DOWN)],
    ],
  );
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.deepEqual(paths(world), [
    '/api/collections/users/auth-with-password',
    '/api/collections/systems/records',
    '/api/collections/alerts/records',
    '/api/beszel/getkey',
  ]);
  // The password goes to the hub only, never in a URL.
  assert.ok(world.network.calls.every((url) => !url.includes('test-password')));
  world.beszel.requests.length = 0;
  await world.hub.pollAll();
  assert.deepEqual(paths(world), [
    '/api/collections/systems/records',
    '/api/collections/alerts/records',
  ]);
});

test('only the added systems receive states, all of them once added', async (t) => {
  const world = await started(t);
  assert.equal(world.fake.states.length, 0);
  await createDevices(world, (device) => device.name === 'agent-one');
  assert.equal(lastState(world, SYSTEM_UP, 'online'), 1);
  assert.equal(lastState(world, SYSTEM_UP, 'cpu'), 48.2);
  assert.equal(lastState(world, SYSTEM_UP, 'memory'), 56.5);
  assert.equal(lastState(world, SYSTEM_UP, 'disk'), 80.4);
  assert.equal(lastState(world, SYSTEM_UP, 'temperature'), 95);
  assert.equal(lastState(world, SYSTEM_UP, 'load_15'), 2.93);
  assert.equal(lastState(world, SYSTEM_UP, 'uptime'), 7.76);
  assert.equal(lastState(world, SYSTEM_UP, 'alerts_triggered'), 1);
  // 113 bytes/s = 0.0009 Mbit/s: rounded to 0.
  assert.equal(lastState(world, SYSTEM_UP, 'network'), 0);
  assert.equal(lastState(world, SYSTEM_DOWN, 'online'), undefined);
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: systemId(world.gladys, SYSTEM_UP),
    transport: 'local',
  });
  // Unchanged values are not sent again; CPU moves, but at most once a minute.
  const count = world.fake.states.length;
  world.beszel.system(SYSTEM_UP).info.cpu = 80;
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count);
  world.clock.advance(61_000);
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count + 1);
  assert.equal(lastState(world, SYSTEM_UP, 'cpu'), 80);
});

test('the container reads Beszel on its own timer, without onPoll (Gladys 5.2.0)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await started(t, { timers: true });
  const before = world.beszel.requests.length;
  t.mock.timers.tick(30_000);
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(world.beszel.requests.length > before, 'read again after 30 s');
  assert.ok(world.fake.discoveredDevices.every((device) => device.should_poll === false));
});

test('a system down then back: two scene events, the device offline in between', async (t) => {
  const world = await started(t);
  await createDevices(world);
  assert.equal(events(world, TRIGGERS.STATUS).length, 0, 'the first read only records');
  world.beszel.setStatus(SYSTEM_UP, 'down');
  await world.hub.pollAll();
  assert.equal(lastState(world, SYSTEM_UP, 'online'), 0);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  // The zeroed figures of a down system are never published.
  assert.equal(lastState(world, SYSTEM_UP, 'cpu'), 48.2);
  world.beszel.setStatus(SYSTEM_UP, 'up');
  await world.hub.pollAll();
  assert.equal(lastState(world, SYSTEM_UP, 'online'), 1);
  assert.deepEqual(
    events(world, TRIGGERS.STATUS).map((event) => [
      event.data.system,
      event.data.status,
      event.data.system_name,
      event.data.status_label,
    ]),
    [
      [systemId(world.gladys), 'down', 'agent-one', 'Offline'],
      [systemId(world.gladys), 'up', 'agent-one', 'Online'],
    ],
  );
});

test('a pause is no transition, and a system back from a pause unannounced', async (t) => {
  const world = await started(t);
  await createDevices(world);
  const states = world.fake.states.length;
  world.beszel.setStatus(SYSTEM_UP, 'paused');
  await world.hub.pollAll();
  world.beszel.setStatus(SYSTEM_UP, 'up');
  await world.hub.pollAll();
  assert.equal(events(world, TRIGGERS.STATUS).length, 0);
  assert.equal(world.fake.states.length, states, 'nothing published while paused');
});

test('an alert triggered then resolved: two scene events with the threshold', async (t) => {
  const world = await started(t);
  await createDevices(world);
  world.beszel.setTriggered(ALERT_MEMORY, true);
  await world.hub.pollAll();
  assert.equal(lastState(world, SYSTEM_UP, 'alerts_triggered'), 2);
  world.beszel.setTriggered(ALERT_MEMORY, false);
  world.beszel.setTriggered(ALERT_CPU, false);
  await world.hub.pollAll();
  assert.equal(lastState(world, SYSTEM_UP, 'alerts_triggered'), 0);
  assert.deepEqual(
    events(world, TRIGGERS.ALERT).map((event) => [
      event.data.alert,
      event.data.state,
      event.data.alert_text,
      event.data.threshold,
    ]),
    [
      ['Memory', 'triggered', 'Memory > 99%', 99],
      ['CPU', 'resolved', 'CPU > 1%', 1],
      ['Memory', 'resolved', 'Memory > 99%', 99],
    ],
  );
  assert.equal(events(world, TRIGGERS.ALERT)[0].data.system, systemId(world.gladys));
});

test('a restart neither misses nor repeats a transition', async (t) => {
  const clock = createClock();
  const beszel = new FakeBeszel({ now: clock.now });
  const first = await createWorld({ clock, beszel });
  const { dataDir } = first;
  await first.app.stop();
  // While the integration is stopped: the CPU alert resolves, the system goes down.
  beszel.setTriggered(ALERT_CPU, false);
  beszel.setStatus(SYSTEM_UP, 'down');
  const second = await createWorld({ clock, beszel, dataDir });
  await second.app.stop();
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => [event.key, event.data.status ?? event.data.state]),
    [
      [TRIGGERS.STATUS, 'down'],
      [TRIGGERS.ALERT, 'resolved'],
    ],
  );
  const third = await createWorld({ clock, beszel, dataDir });
  t.after(() => third.app.stop());
  assert.equal(third.fake.sceneEvents.length, 0);
});

test('an expired token: renewed before it expires, a dead one replaced', async (t) => {
  const world = await started(t);
  const logins = () => paths(world).filter((path) => path.endsWith('auth-with-password')).length;
  // Six days later: one day left, the token is renewed through auth-refresh.
  world.clock.advance(6 * 24 * 3600_000 + 60_000);
  await world.hub.pollAll();
  assert.ok(paths(world).includes('/api/collections/users/auth-refresh'));
  assert.equal(logins(), 1);
  // Every token revoked: PocketBase answers an empty list, not an error.
  world.beszel.revokeTokens();
  await world.hub.pollAll();
  assert.equal(logins(), 2);
  assert.equal(world.fake.discoveredDevices.length, 2, 'no system lost to a dead token');
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.hub.systems.size, 2);
});

test('a refused password, missing credentials, a user who sees no system', async (t) => {
  const refused = await started(t, { config: { ...CONFIG, password: 'wrong' } });
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /email or password refused/);
  assert.equal(refused.fake.discoveredDevices.length, 0);

  const missing = await started(t, { config: { hub_url: '192.0.2.10' } });
  assert.match(missing.fake.connectionStatus.message.fr, /e-mail et le mot de passe/);

  const clock = createClock();
  const empty = new FakeBeszel({ now: clock.now, role: 'readonly' });
  empty.systems = [];
  empty.alerts = [];
  const lonely = await started(t, { clock, beszel: empty });
  assert.equal(lonely.fake.connectionStatus.connected, false);
  assert.match(lonely.fake.connectionStatus.message.en, /sees no system/);
  const report = await lonely.fake.action('test_connection');
  assert.match(
    report.data.message.en,
    /0\/0 system\(s\) online, 0 alert\(s\) triggered, read-only/,
  );
});

test('the hub down: the devices unreachable, no false offline, then back', async (t) => {
  const world = await started(t);
  await createDevices(world);
  world.beszel.failure = 'down';
  await world.hub.pollAll();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(lastState(world, SYSTEM_UP, 'online'), 1, 'the systems may be fine');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(events(world, TRIGGERS.STATUS).length, 0);
  world.beszel.failure = 'proxy';
  await world.hub.pollAll();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  world.beszel.failure = null;
  await world.hub.pollAll();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});

test('an address that is not Beszel, or that redirects, says so', async (t) => {
  for (const [failure, text] of [
    ['html', /no Beszel hub/],
    ['redirect', /https:\/\//],
  ]) {
    const clock = createClock();
    const beszel = new FakeBeszel({ now: clock.now });
    beszel.failure = failure;
    const world = await started(t, { clock, beszel });
    assert.match(world.fake.connectionStatus.message.en, text);
  }
  const invalid = await started(t, { config: { ...CONFIG, hub_url: 'ftp://nas' } });
  assert.match(invalid.fake.connectionStatus.message.en, /Address not understood/);
});

test('a system deleted in Beszel leaves the list; the device turns unreachable', async (t) => {
  const world = await started(t);
  await createDevices(world);
  world.beszel.systems = world.beszel.systems.filter((system) => system.id !== SYSTEM_DOWN);
  await world.hub.pollAll();
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ['agent-one'],
  );
  const badge = world.fake.transports.findLast(
    (entry) => entry.device_external_id === systemId(world.gladys, SYSTEM_DOWN),
  );
  assert.equal(badge.transport, 'unreachable');
});

test('another hub address forgets the systems of the old one, without events', async (t) => {
  const world = await started(t);
  await world.fake.configUpdated({ ...CONFIG, hub_url: '198.51.100.20' });
  assert.equal(world.hub.systems.size, 0);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('the widget: every system, then one system, both valid for the core', async (t) => {
  const world = await started(t);
  const all = (await world.fake.widgetGet('systems', { settings: {}, language: 'fr' })).data
    .content;
  assert.deepEqual(validateWidgetContent(all), []);
  const tiles = all.components.filter((component) => component.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    ['1/2', 1, 1],
  );
  const rows = all.components.find((component) => component.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['ghost', 'Hors ligne'],
      ['agent-one', 'Processeur 48 % · RAM 56 % · ⚠ 1'],
    ],
  );
  const one = (
    await world.fake.widgetGet('systems', {
      settings: { system: systemId(world.gladys) },
      language: 'en',
    })
  ).data.content;
  assert.deepEqual(validateWidgetContent(one), []);
  assert.ok(one.components.length <= 8);
  assert.deepEqual(
    one.components.filter((component) => component.type === 'gauge').map((gauge) => gauge.value),
    [48, 56, 80],
  );
  const alerts = one.components.find((component) => component.type === 'status').items;
  assert.equal(alerts[0].value, 'CPU > 1%');
  const ack = await world.fake.widgetAction('systems', 'refresh', {}, { settings: {} });
  assert.equal(ack.data.message.en, 'Beszel read again.');
});

test('the scene actions: state of a system, of every system, an unknown device', async (t) => {
  const world = await started(t);
  const state = (
    await world.fake.sceneAction('get_system_status', { system: systemId(world.gladys) })
  ).data;
  assert.equal(state.outputs.online, true);
  assert.equal(state.outputs.cpu, 48.2);
  assert.equal(state.outputs.alerts_triggered, 1);
  assert.equal(
    state.outputs.summary,
    'agent-one: CPU 48%, memory 56%, disk 80%, 95 °C, 1 alert(s) triggered (CPU > 1%)',
  );
  const ghost = (
    await world.fake.sceneAction('get_system_status', {
      system: systemId(world.gladys, SYSTEM_DOWN),
    })
  ).data;
  assert.equal(ghost.outputs.online, false);
  assert.equal(ghost.outputs.summary, 'ghost: Offline');
  const overview = (await world.fake.sceneAction('get_overview', {})).data;
  assert.deepEqual(
    { ...overview.outputs, summary: undefined },
    { count: 2, online: 1, offline: 1, alerts_triggered: 1, summary: undefined },
  );
  assert.equal(
    overview.outputs.summary,
    'Offline: ghost\nagent-one: 1 alert(s) triggered (CPU > 1%)',
  );
  const unknown = await world.fake.sceneAction('get_system_status', { system: 'x:system:nothere' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /not a system of the configured Beszel hub/);
});
