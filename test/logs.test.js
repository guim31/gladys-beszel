// -----------------------------------------------------------------------------
// The logs the Gladys supervisor keeps: at the info level, only the life
// cycle. A normal reading cycle (reads, states, scene events) writes nothing;
// a failure that repeats at every read writes one line, then one when it heals.
// The SDK logger writes debug/info with console.log, warn/error with
// console.error, at the level of LOG_LEVEL read on every line.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import {
  ALERT_MEMORY,
  PASSWORD,
  SYSTEM_UP,
  createClock,
  createDevices,
  createWorld,
} from './helpers/world.js';

/** The lines written at `LOG_LEVEL=info` from now on, by level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function hubWorld(t) {
  const world = await createWorld({ clock: createClock() });
  t.after(() => world.app.stop());
  return world;
}

test('a normal cycle writes nothing: reads, states, scene events, token renewal', async (t) => {
  const world = await hubWorld(t);
  const lines = captureLogs(t);
  await createDevices(world);
  for (let read = 0; read < 6; read += 1) {
    world.clock.advance(61_000);
    world.beszel.system(SYSTEM_UP).info.cpu = 10 + read * 7;
    world.beszel.setTriggered(ALERT_MEMORY, read % 2 === 1);
    await world.hub.pollAll();
  }
  world.clock.advance(6 * 24 * 3600_000 + 60_000);
  await world.hub.pollAll();
  await world.hub.rediscover();
  assert.ok(world.fake.states.length > 15, 'states published');
  assert.ok(world.fake.sceneEvents.length >= 5, 'scene events fired');
  assert.deepEqual(lines, []);
});

test('the password never reaches a log line, even in debug', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await hubWorld(t);
  world.beszel.revokeTokens();
  world.beszel.password = 'changed';
  await world.hub.pollAll();
  world.beszel.failure = 'down';
  await world.hub.pollAll();
  assert.ok(lines.length > 0);
  assert.ok(
    lines.every((line) => !line.includes(PASSWORD)),
    lines.join('\n'),
  );
  assert.ok(lines.every((line) => !line.includes('eyJ') && !line.includes('.sig')));
});

test('the hub down for several reads: one line, then one when it answers again', async (t) => {
  const world = await hubWorld(t);
  await createDevices(world);
  const lines = captureLogs(t);
  world.beszel.failure = 'down';
  for (let read = 0; read < 5; read += 1) {
    world.clock.advance(61_000);
    await world.hub.pollAll();
  }
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*Beszel \(192\.0\.2\.10\)/);
  world.beszel.failure = null;
  await world.hub.pollAll();
  await world.hub.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /\[INFO\].*Beszel \(192\.0\.2\.10\) answers again/);
});

test('Gladys refusing the states for several reads: one line, then one', async (t) => {
  const world = await hubWorld(t);
  await createDevices(world);
  const lines = captureLogs(t);
  const publishStates = world.gladys.publishStates.bind(world.gladys);
  let refuse = true;
  t.mock.method(world.gladys, 'publishStates', async (states) => {
    if (refuse) {
      throw new Error('Gladys is away');
    }
    return publishStates(states);
  });
  for (let read = 0; read < 5; read += 1) {
    world.clock.advance(61_000);
    world.beszel.system(SYSTEM_UP).info.dp = 50 + read; // a value to send at every read
    await world.hub.pollAll();
  }
  assert.ok(world.gladys.publishStates.mock.callCount() >= 5);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*States refused: Gladys is away/);
  refuse = false;
  world.clock.advance(61_000);
  await world.hub.pollAll();
  world.clock.advance(61_000);
  await world.hub.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /\[INFO\].*States accepted again/);
});

test('a /data that refuses every write: one line, then one when it works again', async (t) => {
  const lines = captureLogs(t);
  const parent = mkdtempSync(join(tmpdir(), 'gladys-beszel-'));
  const directory = join(parent, 'data');
  writeFileSync(directory, 'a file where the directory should be');
  const store = new Store(directory);
  for (let write = 0; write < 4; write += 1) {
    await store.save({ write });
  }
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*Cannot write/);
  unlinkSync(directory);
  await store.save({ write: 4 });
  await store.save({ write: 5 });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /\[INFO\].*written again/);
});
