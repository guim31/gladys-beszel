// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of a Beszel 0.21.0 hub (a system up with temperature sensors, a
// system down), plus a third system with systemd services and no sensor, in
// every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, FakeBeszel, createClock, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const SERVICES_ID = 'svc0000000000a1';

async function discover(language) {
  const clock = createClock();
  const beszel = new FakeBeszel({ now: clock.now });
  // A machine with systemd watched (`sv`: 41 services, 1 failed) and no sensor.
  const info = { ...beszel.systems[0].info, sv: [41, 1] };
  delete info.dt;
  beszel.systems.push({ ...beszel.systems[0], id: SERVICES_ID, name: 'vm', info });
  const world = await createWorld({ clock, beszel, config: { ...CONFIG, language } });
  await world.app.stop();
  return world.fake.discoveredDevices;
}

const scenarios = [
  { label: 'English names', language: 'en' },
  { label: 'French names', language: 'fr' },
  { label: 'German names', language: 'de' },
  { label: 'Spanish names', language: 'es' },
];

test('the fixtures cover a system with sensors, one down, one with services', async () => {
  const devices = await discover('en');
  assert.deepEqual(
    devices.map((device) => device.name),
    ['agent-one', 'ghost', 'vm'],
  );
  const has = (device, key) =>
    device.features.some((feature) => feature.external_id.endsWith(`:${key}`));
  assert.ok(has(devices[0], 'temperature'));
  assert.ok(!has(devices[1], 'temperature'));
  assert.ok(has(devices[2], 'failed_services'));
  assert.ok(!has(devices[0], 'failed_services'));
});

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const devices = await discover(scenario.language);
    assert.equal(devices.length, 3, `expected the fixture devices, got ${devices.length}`);
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
