// -----------------------------------------------------------------------------
// From the records of the Beszel hub to what the integration shows. Pure
// functions, tested on real answers of Beszel 0.21.0 (test/fixtures/beszel/).
//
// A system record carries `status` (up, down, paused, pending) and `info`, the
// summary the hub keeps from the last agent report (one a minute):
//
//   cpu  CPU usage %           mp  memory used %      dp  root disk used %
//   dt   dashboard temperature (the highest sensor, or the GPU), °C
//   bb   network traffic, bytes/s (sent + received; `b`, MB/s, before 0.12)
//   la   load averages [1, 5, 15]   u  uptime, seconds
//   sv   [systemd services, failed]  v  agent version
//
// Keys are left out when the agent has nothing (no sensor: no `dt`) and, for
// some, when the value is 0: the GPU usage `g` comes and goes with the load,
// so it is not a feature (a feature that comes and goes changes the device). When the
// system is not up, `info` is zeroed by the hub: it is not read then.
// -----------------------------------------------------------------------------

export const SYSTEM_STATUSES = Object.freeze(['up', 'down', 'paused', 'pending']);

// Alert kinds of the Beszel `alerts` collection (its `name` select), the ones
// a scene filter offers. A kind added by a later Beszel still fires, unfiltered.
export const ALERT_NAMES = Object.freeze([
  'Status',
  'CPU',
  'Memory',
  'Disk',
  'Temperature',
  'Bandwidth',
  'GPU',
  'LoadAvg1',
  'LoadAvg5',
  'LoadAvg15',
  'Battery',
  'ContainerHealth',
  'SystemdFailed',
  'CPUIOWait',
  'CPUSteal',
  'NetworkMonitorLoss',
]);

const ID = /^[a-z0-9]{15}$/;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const percent = (value) => {
  const n = num(value);
  return n === null ? null : Math.min(100, Math.max(0, n));
};

/** The figures of an `info` object, null for what the agent does not report. */
export function parseInfo(info) {
  const source = info && typeof info === 'object' ? info : {};
  const load = Array.isArray(source.la) && source.la.length === 3 ? source.la.map(num) : null;
  const bytes = num(source.bb) ?? (num(source.b) === null ? null : source.b * 1024 * 1024);
  const temperature = num(source.dt);
  const services = Array.isArray(source.sv) ? source.sv.map(num) : null;
  return {
    cpu: percent(source.cpu),
    memory: percent(source.mp),
    disk: percent(source.dp),
    // 0 means "no sensor" for Beszel (its alerts skip a temperature below 1).
    temperature: temperature !== null && temperature >= 1 ? temperature : null,
    networkMbps: bytes === null ? null : (bytes * 8) / 1e6,
    load: load && load.every((value) => value !== null) ? load : null,
    uptime: num(source.u),
    failedServices: services && services[1] !== null ? services[1] : null,
    agentVersion: typeof source.v === 'string' && source.v ? source.v : null,
  };
}

/** The systems of the user, sorted by name; records without a usable id are dropped. */
export function parseSystems(items) {
  const systems = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !ID.test(item.id)) {
      continue;
    }
    const status = SYSTEM_STATUSES.includes(item.status) ? item.status : 'pending';
    systems.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.id,
      status,
      info: status === 'up' ? parseInfo(item.info) : null,
    });
  }
  return systems.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The alerts of the user, by system id. */
export function parseAlerts(items) {
  const bySystem = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !ID.test(item.id) || !ID.test(item.system) || typeof item.name !== 'string') {
      continue;
    }
    const alert = {
      id: item.id,
      system: item.system,
      name: item.name,
      threshold: num(item.value),
      minutes: num(item.min),
      triggered: item.triggered === true,
      // A network monitor alert names its probe.
      monitor:
        typeof item.monitor_name === 'string' && item.monitor_name ? item.monitor_name : null,
    };
    if (!bySystem.has(item.system)) {
      bySystem.set(item.system, []);
    }
    bySystem.get(item.system).push(alert);
  }
  for (const alerts of bySystem.values()) {
    alerts.sort(
      (a, b) =>
        ALERT_NAMES.indexOf(a.name) - ALERT_NAMES.indexOf(b.name) || a.id.localeCompare(b.id),
    );
  }
  return bySystem;
}
