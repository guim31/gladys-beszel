// -----------------------------------------------------------------------------
// The Beszel hub as Gladys sees it: one hub, read on a timer of the container
// (the interval chosen in the configuration), one state per system the
// configured user can see. Per read: the list of the systems (status and
// `info` summary) and the list of the user's alerts, two requests whatever
// the number of systems.
//
// Gladys never polls these devices (should_poll: false): the interval goes
// up to 5 minutes, beyond the fixed list of the core scheduler, and the
// scene events must fire for every system, added to Gladys or not.
//
// Polling and not the realtime subscription of PocketBase (`/api/realtime`,
// server-sent events): the hub refreshes a system once a minute, a read every
// 30 seconds misses nothing, and a long-lived stream would have to be watched
// and resumed after every network blip, Gladys restart or token renewal.
//
// The 300 states per minute of Gladys: only the devices added are published,
// only what changed (rounded), the values that move at every read at most
// once a minute, and a budget of 240 states per minute on top. Every value
// is sent again after 6 hours unchanged, before the core marks it outdated.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { BeszelClient, ERROR_KINDS } from './beszel/client.js';
import { parseAlerts, parseSystems } from './beszel/model.js';
import { hostOf } from './config.js';
import { FEATURE_KEYS, buildDevice, deviceIds, featureValues, parseDeviceId } from './devices.js';
import { createIssueLog } from './logs.js';
import {
  ACTION_TEXT,
  ALERT_STATE_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  STATUS_TEXT,
  alertLabel,
  alertText,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'beszel-hub' });

export const WIDGET_KEY = 'systems';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  STATUS: 'system_status_changed',
  ALERT: 'alert_status_changed',
});

export const HUB_TIMINGS = {
  // A hub that fails once is read again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // The values that move at every read (CPU, load, rates…): at most this often.
  noisyEveryMs: 60_000,
  // An unchanged value is sent again after this long.
  heartbeatMs: 6 * 3600_000,
  // A scene action reads the hub again when the last read is older.
  freshMs: 15_000,
  // What is remembered of a system gone from the hub for a week is forgotten.
  forgetAfterMs: 7 * 24 * 3600_000,
  // States sent per minute at most, below the 300 of Gladys.
  statesPerMinute: 240,
};

// Systems read, at most: a fleet beyond is out of scope.
export const MAX_SYSTEMS = 100;

const MAX_STATES_PER_REQUEST = 100;
const MAX_TRANSPORTS_PER_REQUEST = 100;

const signature = (config) =>
  JSON.stringify([config.url, config.email, config.password, config.allowSelfSigned]);

export class BeszelHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/beszel/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.signature = null;
    this.client = null;
    /** Hub read state: { error, readAt, polling } */
    this.link = { error: null, readAt: 0, okAt: 0, polling: null };
    /** @type {Map<string, object>} system states, by record id */
    this.systems = new Map();
    /**
     * Persisted per system: { status (last up/down), triggered (alert ids),
     * known (features seen), seenAt }.
     */
    this.saved = {};
    this.published = new Map();
    this.publishedAt = new Map();
    this.sentTimes = [];
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.pollTimer = null;
    this.retryTimer = null;
    this.stopped = false;
    this.issues = createIssueLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = saved?.systems && typeof saved.systems === 'object' ? saved.systems : {};
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.publishedAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.config?.language !== config.language;
    const previous = this.config;
    this.config = config;
    if (this.signature !== signature(config)) {
      this.signature = signature(config);
      clearTimeout(this.retryTimer);
      this.link = { error: null, readAt: 0, okAt: 0, polling: null };
      this.client = config.url
        ? new BeszelClient({
            url: config.url,
            email: config.email,
            password: config.password,
            insecure: config.allowSelfSigned,
            request: this.request,
            now: this.now,
          })
        : null;
      if (previous && (previous.url !== config.url || previous.email !== config.email)) {
        // Another hub, or another user (alerts belong to a user): start again
        // from scratch, silently.
        this.systems.clear();
        this.saved = {};
        this.store.save({ systems: this.saved });
      }
    }
    if (languageChanged) {
      this.discovered = null;
    }
    await this.pollAll({ publish: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.retryTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.issues.ok('poll', 'Polling works again');
      } catch (err) {
        this.issues.fail('poll', 'error', 'Poll failed', err);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Names and identities ----------------------------------------------------

  hubLabel() {
    return `Beszel (${hostOf(this.config.url)})`;
  }

  systemId(id) {
    return deviceIds(this.gladys, id).device;
  }

  /** The ids of the systems the user added. */
  createdIds() {
    const ids = new Set();
    for (const device of this.gladys.devices ?? []) {
      const id = parseDeviceId(this.gladys, device.external_id);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** The system of a device external id, null when unknown. */
  find(externalId) {
    const id = parseDeviceId(this.gladys, externalId);
    return id ? (this.systems.get(id) ?? null) : null;
  }

  /** Read without error, and the system itself up. */
  isOnline(system) {
    return this.link.error === null && system.status === 'up' && system.info !== null;
  }

  item(system) {
    return {
      info: system.info,
      alerts: system.alerts,
      online: this.isOnline(system),
      known: this.saved[system.id]?.known ?? {},
    };
  }

  // --- Devices -----------------------------------------------------------------

  discoveredDevices() {
    return this.systemList().map((system) =>
      buildDevice(this.gladys, {
        id: system.id,
        name: system.name,
        item: this.item(system),
        language: this.config.language,
      }),
    );
  }

  /** Publish the Discovery list when it changed (a system added, a sensor seen…). */
  async publishDevices({ force = false } = {}) {
    // Never before a successful read: an empty list would empty the Discover tab.
    if (!this.client || this.link.okAt === 0 || (this.link.error && !force)) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices.map((device) => [device.name, device.features]));
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.issues.ok('discovery', 'Discovered devices accepted again');
    } catch (err) {
      this.issues.fail('discovery', 'warn', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read the hub, publish the list again. */
  async rediscover() {
    await this.pollAll();
    await this.publishDevices({ force: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const system = this.find(device.external_id);
    if (!system) {
      return;
    }
    this.transports.delete(device.external_id);
    await this.publishSystemStates(system, { force: true });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The user deleted a device: forget what was sent for it. */
  onDeviceDeleted(device) {
    const id = device?.external_id;
    if (typeof id !== 'string') {
      return;
    }
    this.transports.delete(id);
    for (const map of [this.published, this.publishedAt]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${id}:`)) {
          map.delete(key);
        }
      }
    }
  }

  // --- Reading the hub ---------------------------------------------------------

  async pollAll({ publish = false } = {}) {
    const changed = this.client ? await this.poll() : false;
    await this.afterChanges(changed, { publish });
  }

  /** Gladys asks for a refresh (onPoll): read the hub now. */
  async pollDevice(device) {
    if (this.find(device.external_id)) {
      await this.pollAll();
    }
  }

  /** Read the hub again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.link.readAt >= this.timings.freshMs) {
      await this.pollAll();
    }
  }

  /**
   * Read the hub. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget should be refreshed now
   */
  poll() {
    const { link, client } = this;
    link.polling ??= this.read(client, link).finally(() => {
      link.polling = null;
    });
    return link.polling;
  }

  async read(client, link) {
    let systemItems;
    let alertItems;
    try {
      systemItems = await client.systems();
      if (systemItems.length === 0) {
        // PocketBase answers an empty list to a dead token: renew it, and ask again.
        await client.verify();
        systemItems = await client.systems();
      }
      alertItems = await client.alerts();
      if (client.version === null) {
        await client.info();
      }
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return link === this.link ? this.hubFailed(err) : false;
    }
    // A read that ended after a reconfiguration is stale.
    if (link !== this.link) {
      return false;
    }
    let changed = link.error !== null || link.readAt === 0;
    if (link.error) {
      logger.info(`${this.hubLabel()} answers again`);
    } else if (link.readAt === 0) {
      logger.info(
        `${this.hubLabel()}: connected${client.version ? `, Beszel ${client.version}` : ''}`,
      );
    }
    link.error = null;
    link.readAt = this.now();
    link.okAt = link.readAt;
    this.issues.ok('systems-limit', 'Systems back under the limit');

    let systems = parseSystems(systemItems);
    if (systems.length > MAX_SYSTEMS) {
      this.issues.fail(
        'systems-limit',
        'warn',
        `${systems.length} systems: the first ${MAX_SYSTEMS} are read`,
      );
      systems = systems.slice(0, MAX_SYSTEMS);
    }
    const alerts = parseAlerts(alertItems);
    const seen = new Set();
    for (const [order, parsed] of systems.entries()) {
      // Reconfigured meanwhile (another hub, another user): drop the rest.
      if (link !== this.link) {
        return false;
      }
      seen.add(parsed.id);
      if (await this.readSystem(parsed, alerts.get(parsed.id) ?? [], order)) {
        changed = true;
      }
    }
    // A system deleted in Beszel, or no longer shared with the user.
    for (const id of [...this.systems.keys()]) {
      if (!seen.has(id)) {
        logger.info(`${this.systems.get(id).name}: no longer in Beszel`);
        this.systems.delete(id);
        changed = true;
      }
    }
    if (link !== this.link) {
      return false;
    }
    this.forgetStale();
    this.store.save({ systems: this.saved });
    return changed;
  }

  async readSystem(parsed, alerts, order) {
    const previous = this.systems.get(parsed.id);
    const system = { ...parsed, order, alerts };
    this.systems.set(parsed.id, system);
    const saved = this.saved[parsed.id];
    const known = { ...saved?.known };
    if (parsed.info?.temperature !== null && parsed.info?.temperature !== undefined) {
      known.temperature = true;
    }
    if (parsed.info?.failedServices !== null && parsed.info?.failedServices !== undefined) {
      known.services = true;
    }
    const triggered = alerts.filter((alert) => alert.triggered).map((alert) => alert.id);
    // Only up and down are remembered: a pause is no transition.
    const status = ['up', 'down'].includes(parsed.status) ? parsed.status : (saved?.status ?? null);
    let changed =
      !previous ||
      previous.status !== system.status ||
      previous.name !== system.name ||
      JSON.stringify(previous.alerts) !== JSON.stringify(alerts);

    if (saved) {
      if (saved.status && status && saved.status !== status) {
        logger.info(`${system.name}: ${status === 'up' ? 'back online' : 'offline'}`);
        await this.fireEvent(TRIGGERS.STATUS, {
          system: this.systemId(system.id),
          status,
          system_name: system.name,
          status_label: pick(STATUS_TEXT[status], this.config.language),
        });
        changed = true;
      }
      const before = new Set(saved.triggered ?? []);
      for (const alert of alerts) {
        if (alert.triggered && !before.has(alert.id)) {
          await this.fireAlert(system, alert, 'triggered');
        } else if (!alert.triggered && before.has(alert.id)) {
          await this.fireAlert(system, alert, 'resolved');
        }
      }
      // An alert deleted in Beszel while triggered: no event, it was not resolved.
    }
    this.saved[parsed.id] = { status, triggered, known, seenAt: this.now() };
    await this.publishSystemStates(system);
    return changed;
  }

  async fireAlert(system, alert, state) {
    logger.debug(`${system.name}: alert ${alert.name} ${state}`);
    await this.fireEvent(TRIGGERS.ALERT, {
      system: this.systemId(system.id),
      alert: alert.name,
      state,
      system_name: system.name,
      alert_label: alertLabel(alert.name, this.config.language),
      alert_text: alertText(alert, this.config.language),
      state_label: pick(ALERT_STATE_TEXT[state], this.config.language),
      threshold: alert.threshold ?? 0,
    });
  }

  async hubFailed(err) {
    const { link } = this;
    const wasError = link.error?.kind;
    link.error = { kind: err.kind, message: err.message };
    link.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`${this.hubLabel()}: ${err.message}`);
    } else {
      logger.debug(`${this.hubLabel()}: ${err.message}`);
    }
    if (err.kind === ERROR_KINDS.UNREACHABLE && !wasError) {
      this.scheduleRetry();
    }
    return wasError !== err.kind;
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.pollAll()
        .then(() => this.issues.ok('retry', 'Retry works again'))
        .catch((err) => this.issues.fail('retry', 'error', 'Retry failed', err));
    }, this.timings.retryMs);
    this.retryTimer.unref?.();
  }

  /** Forget what was remembered of systems gone for a week (a machine retired). */
  forgetStale() {
    for (const [id, entry] of Object.entries(this.saved)) {
      if (!this.systems.has(id) && this.now() - (entry?.seenAt ?? 0) > this.timings.forgetAfterMs) {
        delete this.saved[id];
      }
    }
  }

  async fireEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('scene', 'warn', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------

  /**
   * The states of a system the user added: every value while it is up, only
   * "offline" and the alert count while it is down, nothing while it is
   * paused or not yet reached by the hub.
   */
  async publishSystemStates(system, { force = false } = {}) {
    if (!this.createdIds().has(system.id) || this.link.error) {
      return;
    }
    let values = featureValues(this.gladys, { id: system.id, item: this.item(system) });
    if (system.status !== 'up') {
      if (system.status !== 'down') {
        return;
      }
      const keep = new Set(
        [FEATURE_KEYS.ONLINE, FEATURE_KEYS.ALERTS].map((key) =>
          deviceIds(this.gladys, system.id).feature(key),
        ),
      );
      values = values.filter((entry) => keep.has(entry.externalId));
    }
    await this.sendStates(values, { force });
  }

  /** Keep what must be sent now: changed, not too soon, within the budget. */
  async sendStates(values, { force = false } = {}) {
    const now = this.now();
    const due = [];
    for (const { externalId, value, noisy } of values) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      const at = this.publishedAt.get(externalId);
      if (!force) {
        if (last === value && at !== undefined && now - at < this.timings.heartbeatMs) {
          continue;
        }
        if (last !== value && noisy && at !== undefined && now - at < this.timings.noisyEveryMs) {
          continue;
        }
      }
      due.push({ externalId, value, noisy });
    }
    this.sentTimes = this.sentTimes.filter((time) => now - time < 60_000);
    let states = due;
    if (!force) {
      const allowed = Math.max(0, this.timings.statesPerMinute - this.sentTimes.length);
      if (due.length > allowed) {
        // The quiet values first (online, alerts, disk); the rest waits.
        states = [...due.filter((s) => !s.noisy), ...due.filter((s) => s.noisy)].slice(0, allowed);
      }
    }
    for (let i = 0; i < states.length; i += 1) {
      this.sentTimes.push(now);
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(
          batch.map(({ externalId, value }) => ({
            device_feature_external_id: externalId,
            state: value,
          })),
        );
        for (const { externalId, value } of batch) {
          this.published.set(externalId, value);
          this.publishedAt.set(externalId, now);
        }
        this.issues.ok('states', 'States accepted again');
      } catch (err) {
        this.issues.fail('states', 'warn', `States refused: ${err.message}`);
        for (let i = 0; i < batch.length; i += 1) {
          const index = this.sentTimes.lastIndexOf(now);
          if (index >= 0) {
            this.sentTimes.splice(index, 1);
          }
        }
      }
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /**
   * The badge of the added devices: "local" while the system is up,
   * "unreachable" when it is down, gone from the hub, or the hub silent.
   */
  async publishTransports() {
    if (!this.client || this.link.readAt === 0) {
      return;
    }
    const entries = [];
    for (const id of this.createdIds()) {
      const system = this.systems.get(id);
      if (system && ['paused', 'pending'].includes(system.status) && !this.link.error) {
        continue;
      }
      const externalId = this.systemId(id);
      const transport =
        system && this.isOnline(system) ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.issues.ok('transports', 'Transports accepted again');
      } catch (err) {
        this.issues.fail('transports', 'warn', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config || !this.client) {
      return {
        connected: false,
        message: this.config?.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noHub,
      };
    }
    if (this.link.error) {
      const message = {};
      for (const language of Object.keys(CONNECTION_TEXT.noHub)) {
        message[language] = labelled(
          hostOf(this.config.url),
          pick(ERROR_TEXT[this.link.error.kind], language),
          language,
        ).slice(0, 200);
      }
      return { connected: false, message };
    }
    if (this.link.readAt !== 0 && this.systems.size === 0) {
      return { connected: false, message: CONNECTION_TEXT.noSystem };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.issues.ok('connection', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('connection', 'warn', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views (widget, scene actions, report) -------------------------------------

  /** Every system, in the order of the hub (by name). */
  systemList() {
    return [...this.systems.values()].sort((a, b) => a.order - b.order);
  }

  /** What the widget and the scene actions show of a system. */
  view(system) {
    return {
      name: system.name,
      status: this.link.error ? null : system.status,
      online: this.isOnline(system),
      info: system.info,
      alerts: system.alerts,
      triggered: system.alerts.filter((alert) => alert.triggered),
    };
  }

  /** "Test the connection": read the hub now, and say what it holds. */
  async testConnection() {
    await this.pollAll({ publish: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const status = this.connectionStatus();
      if (!this.client || this.link.error) {
        message[language] = pick(status.message, language);
        continue;
      }
      const systems = this.systemList();
      const up = systems.filter((system) => this.isOnline(system)).length;
      const triggered = systems.reduce(
        (count, system) => count + system.alerts.filter((alert) => alert.triggered).length,
        0,
      );
      const parts = [
        text.ok,
        ...(this.client.version ? [`Beszel ${this.client.version}`] : []),
        text.systems(up, systems.length),
        text.alerts(triggered),
        ...(this.client.role === 'readonly' ? [text.readonly] : []),
      ];
      const lines = [labelled(hostOf(this.config.url), parts.join(', '), language)];
      if (systems.length === 0) {
        lines.push(pick(CONNECTION_TEXT.noSystem, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** Throws the reason no hub can answer a scene action, if any. */
  assertReadable() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noHub, this.config?.language));
    }
  }
}
