// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is the CPU above 80 %?" is already a scene condition on the device
// features. The actions do what a condition cannot: put the state of a system,
// or of every system, in a message ("nas: CPU 12 %, memory 45 %, disk 78 %,
// no alert triggered"). They read the hub again when the last read is older
// than 15 seconds. An offline system is an answer, not a failure: `online`
// false, and the summary says so — the scene can still send it.
// -----------------------------------------------------------------------------

import {
  ACTION_TEXT,
  ERROR_TEXT,
  STATUS_TEXT,
  SUMMARY_TEXT,
  alertText,
  formatCelsius,
  formatPercent,
  labelled,
  pick,
} from './texts.js';

// Alerts listed in a summary, at most (the rest is counted).
export const MAX_LISTED_ALERTS = 10;

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

const capitalize = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** The triggered alerts of a system, in words: "CPU > 80 %, Disk > 90 %". */
function alertsText(view, language) {
  const text = SUMMARY_TEXT[language] ?? SUMMARY_TEXT.en;
  if (!view.triggered.length) {
    return text.noAlert;
  }
  const listed = view.triggered.slice(0, MAX_LISTED_ALERTS).map((a) => alertText(a, language));
  const more = view.triggered.length - listed.length;
  return `${text.alerts(view.triggered.length)} (${listed.join(', ')}${more > 0 ? `, +${more}` : ''})`;
}

/** The one-line state of a system, in the configured language. */
export function summarize(view, language, hubError = null) {
  const text = SUMMARY_TEXT[language] ?? SUMMARY_TEXT.en;
  if (hubError) {
    return labelled(view.name, pick(ERROR_TEXT[hubError], language), language);
  }
  if (!view.online) {
    return labelled(view.name, pick(STATUS_TEXT[view.status], language), language);
  }
  const { info } = view;
  const parts = [];
  if (info.cpu !== null) {
    parts.push(`${text.cpu} ${formatPercent(info.cpu, language)}`);
  }
  if (info.memory !== null) {
    parts.push(`${text.memory} ${formatPercent(info.memory, language)}`);
  }
  if (info.disk !== null) {
    parts.push(`${text.disk} ${formatPercent(info.disk, language)}`);
  }
  if (info.temperature !== null) {
    parts.push(formatCelsius(info.temperature, language));
  }
  parts.push(alertsText(view, language));
  return labelled(view.name, parts.join(', '), language);
}

export const SCENE_ACTIONS = {
  async get_system_status(hub, { fields = {} }) {
    hub.assertReadable();
    const language = hub.config.language;
    await hub.refreshIfStale();
    const system = hub.find(fields.system);
    if (!system) {
      throw new Error(pick(ACTION_TEXT.unknownSystem, language));
    }
    const view = hub.view(system);
    const hubError = hub.link.error?.kind ?? null;
    const outputs = {
      name: view.name,
      online: view.online,
      status: pick(STATUS_TEXT[view.status ?? 'unknown'], language),
      alerts_triggered: view.triggered.length,
      summary: summarize(view, language, hubError),
    };
    if (!view.online) {
      return outputs;
    }
    const { info } = view;
    const set = (key, value, digits = 1) => {
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        outputs[key] = round(value, digits);
      }
    };
    set('cpu', info.cpu);
    set('memory', info.memory);
    set('disk', info.disk);
    set('temperature', info.temperature);
    set('network_mbps', info.networkMbps, 2);
    set('load_1', info.load?.[0], 2);
    set('uptime_days', info.uptime === null ? null : info.uptime / 86400, 2);
    return outputs;
  },

  async get_overview(hub) {
    hub.assertReadable();
    const language = hub.config.language;
    const text = SUMMARY_TEXT[language] ?? SUMMARY_TEXT.en;
    await hub.refreshIfStale();
    const hubError = hub.link.error?.kind ?? null;
    const views = hub.systemList().map((system) => hub.view(system));
    const online = views.filter((view) => view.online);
    const offline = views.filter((view) => view.status === 'down');
    const triggered = views.reduce((count, view) => count + view.triggered.length, 0);
    let summary;
    if (hubError) {
      summary = capitalize(pick(ERROR_TEXT[hubError], language));
    } else {
      const lines = [
        capitalize(
          offline.length
            ? text.offline(offline.map((view) => view.name).join(', '))
            : text.allOnline(online.length),
        ),
      ];
      for (const view of views.filter((v) => v.triggered.length)) {
        lines.push(labelled(view.name, alertsText(view, language), language));
      }
      if (!triggered) {
        lines.push(capitalize(text.noAlert));
      }
      summary = lines.join('\n');
    }
    return {
      count: views.length,
      online: online.length,
      offline: offline.length,
      alerts_triggered: triggered,
      summary,
    };
  },
};
