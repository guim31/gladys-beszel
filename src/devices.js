// -----------------------------------------------------------------------------
// The Gladys device of a Beszel system, proposed in the Discovery tab: one per
// system the configured Beszel user can see. The user adds the ones to
// follow, nothing is created on their behalf.
//
// Identity: the id of the system record in the hub (15 characters), kept for
// the life of the system in Beszel, whatever its name or address.
//
// Category/type couples come from the core table (see
// test/gladys-rules.test.js). Usage percentages are
// `level-sensor/liquid-level-percent` (a fill level, the couple Glances and
// Netdata already use), which gives the gauge a 0-100 range. Load averages
// have no category: `unknown/unknown`.
//
// Published with should_poll: false: the integration reads the hub on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'system';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  CPU: 'cpu',
  MEMORY: 'memory',
  DISK: 'disk',
  TEMPERATURE: 'temperature',
  NETWORK: 'network',
  LOAD_1: 'load_1',
  LOAD_5: 'load_5',
  LOAD_15: 'load_15',
  UPTIME: 'uptime',
  FAILED_SERVICES: 'failed_services',
  ALERTS: 'alerts_triggered',
});

const K = FEATURE_KEYS;

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [K.ONLINE]: 'Online',
    [K.CPU]: 'CPU',
    [K.MEMORY]: 'Memory',
    [K.DISK]: 'Disk',
    [K.TEMPERATURE]: 'Highest temperature',
    [K.NETWORK]: 'Network traffic',
    [K.LOAD_1]: 'Load (1 min)',
    [K.LOAD_5]: 'Load (5 min)',
    [K.LOAD_15]: 'Load (15 min)',
    [K.UPTIME]: 'Uptime',
    [K.FAILED_SERVICES]: 'Failed services',
    [K.ALERTS]: 'Triggered alerts',
  },
  fr: {
    [K.ONLINE]: 'En ligne',
    [K.CPU]: 'Processeur',
    [K.MEMORY]: 'Mémoire',
    [K.DISK]: 'Disque',
    [K.TEMPERATURE]: 'Température la plus haute',
    [K.NETWORK]: 'Trafic réseau',
    [K.LOAD_1]: 'Charge (1 min)',
    [K.LOAD_5]: 'Charge (5 min)',
    [K.LOAD_15]: 'Charge (15 min)',
    [K.UPTIME]: 'Durée de fonctionnement',
    [K.FAILED_SERVICES]: 'Services en échec',
    [K.ALERTS]: 'Alertes déclenchées',
  },
  de: {
    [K.ONLINE]: 'Online',
    [K.CPU]: 'Prozessor',
    [K.MEMORY]: 'Arbeitsspeicher',
    [K.DISK]: 'Datenträger',
    [K.TEMPERATURE]: 'Höchste Temperatur',
    [K.NETWORK]: 'Netzwerkverkehr',
    [K.LOAD_1]: 'Last (1 Min.)',
    [K.LOAD_5]: 'Last (5 Min.)',
    [K.LOAD_15]: 'Last (15 Min.)',
    [K.UPTIME]: 'Laufzeit',
    [K.FAILED_SERVICES]: 'Fehlgeschlagene Dienste',
    [K.ALERTS]: 'Ausgelöste Alarme',
  },
  es: {
    [K.ONLINE]: 'En línea',
    [K.CPU]: 'Procesador',
    [K.MEMORY]: 'Memoria',
    [K.DISK]: 'Disco',
    [K.TEMPERATURE]: 'Temperatura más alta',
    [K.NETWORK]: 'Tráfico de red',
    [K.LOAD_1]: 'Carga (1 min)',
    [K.LOAD_5]: 'Carga (5 min)',
    [K.LOAD_15]: 'Carga (15 min)',
    [K.UPTIME]: 'Tiempo en marcha',
    [K.FAILED_SERVICES]: 'Servicios con error',
    [K.ALERTS]: 'Alertas activadas',
  },
};

export const MODEL = 'Beszel';

// Display bounds (the core never applies them on write). Fixed: a bound that
// moves changes the device structure ("Update" in the Discovery tab).
export const BOUNDS = Object.freeze({
  LOAD_MAX: 1000,
  UPTIME_MAX_DAYS: 36500,
  COUNT_MAX: 1000,
  TEMPERATURE: [-40, 150],
  RATE_MAX_MBPS: 100000,
});

/** External ids of the device of a system. */
export const deviceIds = (gladys, systemId) => gladys.externalIds(DEVICE_TYPE, systemId);

/** The system id of a device external id, null when not ours. */
export function parseDeviceId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^[a-z0-9]{15}$/.test(id) ? id : null;
}

const round = (value, digits) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// Feature shapes. `noisy`: moves at every read, published at most once a
// minute (src/hub.js). The hub itself refreshes once a minute anyway.
const percent = () => ({
  definition: {
    category: CATEGORY.LEVEL_SENSOR,
    type: TYPE.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
  },
  digits: 1,
});
const load = () => ({
  definition: {
    category: CATEGORY.UNKNOWN,
    type: TYPE.UNKNOWN.UNKNOWN,
    min: 0,
    max: BOUNDS.LOAD_MAX,
  },
  digits: 2,
  noisy: true,
});
const counter = () => ({
  definition: {
    category: CATEGORY.COUNTER_SENSOR,
    type: TYPE.SENSOR.INTEGER,
    min: 0,
    max: BOUNDS.COUNT_MAX,
  },
  digits: 0,
});

/**
 * The features of a system device. `item` is `{ info, alerts, online }`
 * (src/hub.js), `info` null while the system is not up; `when` tells whether
 * the system has the feature at all, from its last known `info`.
 */
const BLUEPRINT = [
  {
    key: K.ONLINE,
    definition: { category: CATEGORY.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 },
    digits: 0,
    value: (item) => (item.online ? 1 : 0),
  },
  { key: K.CPU, ...percent(), noisy: true, value: (item) => item.info?.cpu },
  { key: K.MEMORY, ...percent(), noisy: true, value: (item) => item.info?.memory },
  { key: K.DISK, ...percent(), value: (item) => item.info?.disk },
  {
    key: K.TEMPERATURE,
    definition: {
      category: CATEGORY.DEVICE_TEMPERATURE_SENSOR,
      type: TYPE.SENSOR.DECIMAL,
      unit: UNIT.CELSIUS,
      min: BOUNDS.TEMPERATURE[0],
      max: BOUNDS.TEMPERATURE[1],
    },
    digits: 1,
    noisy: true,
    when: (item) => item.known?.temperature === true,
    value: (item) => item.info?.temperature,
  },
  {
    key: K.NETWORK,
    definition: {
      category: CATEGORY.DATARATE,
      type: TYPE.DATARATE.RATE,
      unit: UNIT.MEGABITS_PER_SECOND,
      min: 0,
      max: BOUNDS.RATE_MAX_MBPS,
    },
    digits: 2,
    noisy: true,
    value: (item) => item.info?.networkMbps,
  },
  { key: K.LOAD_1, ...load(), value: (item) => item.info?.load?.[0] },
  { key: K.LOAD_5, ...load(), value: (item) => item.info?.load?.[1] },
  { key: K.LOAD_15, ...load(), value: (item) => item.info?.load?.[2] },
  {
    key: K.UPTIME,
    definition: {
      category: CATEGORY.DURATION,
      type: TYPE.DURATION.DECIMAL,
      unit: UNIT.DAYS,
      min: 0,
      max: BOUNDS.UPTIME_MAX_DAYS,
    },
    // Hundredths of a day (about 15 minutes): it moves at that pace.
    digits: 2,
    value: (item) =>
      item.info?.uptime === null || item.info?.uptime === undefined
        ? null
        : item.info.uptime / 86400,
  },
  {
    key: K.FAILED_SERVICES,
    ...counter(),
    when: (item) => item.known?.services === true,
    value: (item) => item.info?.failedServices,
  },
  {
    key: K.ALERTS,
    ...counter(),
    value: (item) => (item.alerts ? item.alerts.filter((alert) => alert.triggered).length : null),
  },
];

const featuresOf = (item) => BLUEPRINT.filter((feature) => !feature.when || feature.when(item));

/**
 * The discovery payload of a system device.
 * @param {object} gladys SDK client
 * @param {object} options
 * @param {string} options.id system record id
 * @param {string} options.name device name
 * @param {object} options.item { info, alerts, online, known }
 * @param {string} [options.language] feature names language
 */
export function buildDevice(gladys, { id, name, item, language = 'en' }) {
  const ids = deviceIds(gladys, id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: name.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    features: featuresOf(item).map((feature) => ({
      name: names[feature.key],
      external_id: ids.feature(feature.key),
      ...feature.definition,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
  };
}

/**
 * The value of every feature of a system (null: nothing to publish).
 * @returns {Array<{ externalId: string, value: number|null, noisy: boolean }>}
 */
export function featureValues(gladys, { id, item }) {
  const ids = deviceIds(gladys, id);
  return featuresOf(item).map((feature) => ({
    externalId: ids.feature(feature.key),
    value: round(feature.value(item), feature.digits),
    noisy: Boolean(feature.noisy),
  }));
}
