// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `systems`.
//
// The use case: a glance at the wall tablet tells whether the machines are
// fine, and which Beszel alerts are triggered.
//
//   - No system chosen: every system at once. Three tiles (systems online,
//     offline, alerts triggered), then one row per system, the problems
//     first, with its CPU and memory.
//   - A system chosen: CPU, memory and disk gauges, the highest temperature,
//     then its triggered alerts, its load and uptime.
//
// The figures are sent as values, not bound to device features: the widget
// works before any device is added (without a system chosen).
//
// Budget (8 components, 2 texts): one heading, up to four tiles or gauges,
// one status list of eight rows at most, a Refresh button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { WIDGET_KEY } from './hub.js';
import {
  ERROR_TEXT,
  STATUS_TEXT,
  alertText,
  formatNumber,
  formatPercent,
  formatUptime,
  labelled,
  pick,
} from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 8;

export const TEXT = {
  noHub: {
    en: 'No Beszel hub yet: enter its address in the configuration.',
    fr: 'Pas encore de hub Beszel : saisissez son adresse dans la configuration.',
    de: 'Noch kein Beszel-Hub: Gib seine Adresse in der Konfiguration ein.',
    es: 'Aún no hay ningún hub Beszel: introduzca su dirección en la configuración.',
  },
  noSystem: {
    en: 'This Beszel user sees no system yet.',
    fr: 'Cet utilisateur Beszel ne voit encore aucun système.',
    de: 'Dieser Beszel-Benutzer sieht noch kein System.',
    es: 'Este usuario de Beszel aún no ve ningún sistema.',
  },
  gone: {
    en: 'This system is no longer in the configured Beszel hub.',
    fr: "Ce système n'est plus dans le hub Beszel configuré.",
    de: 'Dieses System ist nicht mehr im konfigurierten Beszel-Hub.',
    es: 'Este sistema ya no está en el hub Beszel configurado.',
  },
  waiting: {
    en: 'Waiting for the first answer of Beszel…',
    fr: 'En attente de la première réponse de Beszel…',
    de: 'Warte auf die erste Antwort von Beszel …',
    es: 'Esperando la primera respuesta de Beszel…',
  },
  noAlert: {
    en: 'No alert triggered',
    fr: 'Aucune alerte déclenchée',
    de: 'Kein ausgelöster Alarm',
    es: 'Ninguna alerta activada',
  },
  title: { en: 'Beszel', fr: 'Beszel', de: 'Beszel', es: 'Beszel' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  alerts: { en: 'Alerts', fr: 'Alertes', de: 'Alarme', es: 'Alertas' },
  cpu: { en: 'CPU', fr: 'Processeur', de: 'Prozessor', es: 'Procesador' },
  memory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  disk: { en: 'Disk', fr: 'Disque', de: 'Datenträger', es: 'Disco' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  uptime: { en: 'Uptime', fr: 'En marche depuis', de: 'Läuft seit', es: 'En marcha desde' },
  load: { en: 'Load', fr: 'Charge', de: 'Last', es: 'Carga' },
  ram: { en: 'RAM', fr: 'RAM', de: 'RAM', es: 'RAM' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otros' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Beszel read again.',
    fr: 'Beszel relu.',
    de: 'Beszel neu gelesen.',
    es: 'Beszel leído de nuevo.',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Danger from 90, warning from 75. */
const usageColor = (value) =>
  value >= 90 ? WIDGET_COLORS.DANGER : value >= 75 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
const temperatureColor = (celsius) =>
  celsius >= 85
    ? WIDGET_COLORS.DANGER
    : celsius >= 70
      ? WIDGET_COLORS.WARNING
      : WIDGET_COLORS.NEUTRAL;

function message(text, language, ttl = 300) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const refreshButton = (language) => ({
  type: 'button',
  label: t(TEXT.refresh, language),
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: ACTIONS.REFRESH },
});

const gauge = (label, value, language) => ({
  type: 'gauge',
  value: Math.round(value),
  min: 0,
  max: 100,
  unit: '%',
  label: t(label, language),
  color: usageColor(value),
});

/** The status list, cut at MAX_ROWS with an "Others +n" row. */
function statusList(rows, language) {
  const shown = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS - 1) : rows;
  if (rows.length > shown.length) {
    shown.push({
      label: t(TEXT.more, language),
      value: `+${rows.length - shown.length}`,
      icon: 'more-horizontal',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  return { type: 'status', items: shown };
}

// The problems first: offline, alerts triggered, then the rest.
const rank = (view) =>
  view.status === 'down' ? 3 : view.triggered.length ? 2 : view.online ? 0 : 1;

function systemRow(view, language) {
  if (!view.online) {
    const down = view.status === 'down';
    return {
      label: fit(view.name, 40),
      value: fit(t(STATUS_TEXT[view.status ?? 'pending'], language), 40),
      icon: down ? 'x-circle' : 'pause-circle',
      color: down ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    };
  }
  const { info } = view;
  const figures = [];
  if (info.cpu !== null) {
    figures.push(`${t(TEXT.cpu, language)} ${formatPercent(info.cpu, language)}`);
  }
  if (info.memory !== null) {
    figures.push(`${t(TEXT.ram, language)} ${formatPercent(info.memory, language)}`);
  }
  if (view.triggered.length) {
    figures.push(`⚠ ${view.triggered.length}`);
  }
  return {
    label: fit(view.name, 40),
    value: fit(figures.join(' · ') || t(TEXT.online, language), 40),
    icon: view.triggered.length ? 'alert-triangle' : 'server',
    color: view.triggered.length ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  };
}

/** Every system: tiles of the totals, one row per system. */
function overview(hub, language) {
  const views = hub.systemList().map((system) => hub.view(system));
  const online = views.filter((view) => view.online).length;
  const offline = views.filter((view) => view.status === 'down').length;
  const triggered = views.reduce((count, view) => count + view.triggered.length, 0);
  const rows = [...views].sort((a, b) => rank(b) - rank(a)).map((v) => systemRow(v, language));
  return {
    ttl_seconds: 30,
    components: [
      { type: 'text', variant: 'heading', text: t(TEXT.title, language) },
      {
        type: 'value',
        value: `${online}/${views.length}`,
        label: t(TEXT.online, language),
        icon: 'server',
        color: online === views.length ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
      },
      {
        type: 'value',
        value: offline,
        label: t(TEXT.offline, language),
        icon: 'x-circle',
        color: offline ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        value: triggered,
        label: t(TEXT.alerts, language),
        icon: 'bell',
        color: triggered ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      },
      statusList(rows, language),
      refreshButton(language),
    ],
  };
}

/** One system: gauges, temperature, its alerts and a few rows. */
function systemComponents(view, language) {
  const { info } = view;
  const components = [];
  if (info.cpu !== null) {
    components.push(gauge(TEXT.cpu, info.cpu, language));
  }
  if (info.memory !== null) {
    components.push(gauge(TEXT.memory, info.memory, language));
  }
  if (info.disk !== null) {
    components.push(gauge(TEXT.disk, info.disk, language));
  }
  if (info.temperature !== null) {
    components.push({
      type: 'value',
      value: Math.round(info.temperature),
      unit: '°C',
      label: t(TEXT.temperature, language),
      icon: 'thermometer',
      color: temperatureColor(info.temperature),
    });
  }
  const rows = view.triggered.map((alert) => ({
    label: fit(t(TEXT.alerts, language), 40),
    value: fit(alertText(alert, language), 40),
    icon: 'alert-triangle',
    color: WIDGET_COLORS.WARNING,
  }));
  if (!rows.length) {
    rows.push({
      label: t(TEXT.alerts, language),
      value: t(TEXT.noAlert, language),
      icon: 'check-circle',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if (info.load) {
    rows.push({
      label: t(TEXT.load, language),
      value: info.load.map((value) => formatNumber(value, language, 2)).join(' · '),
      icon: 'activity',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (info.uptime !== null) {
    rows.push({
      label: t(TEXT.uptime, language),
      value: formatUptime(info.uptime, language),
      icon: 'clock',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push(statusList(rows, language));
  return components;
}

/** The hub refuses or does not answer: say why. */
function hubError(hub, language) {
  return {
    ttl_seconds: 30,
    components: [
      { type: 'text', variant: 'heading', text: t(TEXT.title, language) },
      {
        type: 'text',
        variant: 'body',
        text: labelled(
          hostOf(hub.config.url),
          t(ERROR_TEXT[hub.link.error.kind], language),
          language,
        ).slice(0, 200),
      },
      refreshButton(language),
    ],
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.noHub, language, 30);
  }
  if (hub.link.error) {
    return hubError(hub, language);
  }
  if (hub.link.readAt === 0) {
    return message(TEXT.waiting, language, 30);
  }
  const chosen = typeof settings?.system === 'string' ? settings.system : '';
  if (!chosen) {
    return hub.systems.size ? overview(hub, language) : message(TEXT.noSystem, language, 60);
  }
  const system = hub.find(chosen);
  if (!system) {
    return message(TEXT.gone, language);
  }
  const view = hub.view(system);
  if (!view.online) {
    return {
      ttl_seconds: 30,
      components: [
        { type: 'text', variant: 'heading', text: fit(view.name, 40) },
        statusList([systemRow(view, language)], language),
        refreshButton(language),
      ],
    };
  }
  return {
    ttl_seconds: 30,
    components: [
      { type: 'text', variant: 'heading', text: fit(view.name, 40) },
      ...systemComponents(view, language),
      refreshButton(language),
    ],
  };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollAll();
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
