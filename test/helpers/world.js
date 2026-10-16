// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Beszel hub on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs unless `timers` is set: the
// tests read the hub with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { deviceIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import {
  ALERT_CPU,
  ALERT_MEMORY,
  ALERT_STATUS,
  EMAIL,
  FakeBeszel,
  HUB_URL,
  PASSWORD,
  SYSTEM_DOWN,
  SYSTEM_UP,
  createNetwork,
} from './fakeBeszel.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const CONFIG = { hub_url: '192.0.2.10', email: EMAIL, password: PASSWORD, language: 'en' };

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 16, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {FakeBeszel} [options.beszel]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  beszel = new FakeBeszel({ now: clock.now }),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-beszel-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [HUB_URL]: beszel });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, beszel, network, app, hub: app.hub, clock, dataDir };
}

export const systemId = (gladys, id = SYSTEM_UP) => deviceIds(gladys, id).device;
export const featureId = (gladys, id, feature) => deviceIds(gladys, id).feature(feature);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export {
  ALERT_CPU,
  ALERT_MEMORY,
  ALERT_STATUS,
  EMAIL,
  FakeBeszel,
  HUB_URL,
  PASSWORD,
  SYSTEM_DOWN,
  SYSTEM_UP,
};
