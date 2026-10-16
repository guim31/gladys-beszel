// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene event
// variables, scene action outputs and errors. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './beszel/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noHub: {
    en: 'Enter the address of your Beszel hub in the configuration.',
    fr: "Saisissez l'adresse de votre hub Beszel dans la configuration.",
    de: 'Gib die Adresse deines Beszel-Hubs in der Konfiguration ein.',
    es: 'Introduzca la dirección de su hub Beszel en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.20 or http://nas.lan:8090',
    fr: 'Adresse incomprise, ex. 192.168.1.20 ou http://nas.lan:8090',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20 oder http://nas.lan:8090',
    es: 'Dirección no válida, p. ej. 192.168.1.20 o http://nas.lan:8090',
  },
  noSystem: {
    en: 'Connected, but this Beszel user sees no system: share the systems with it in Beszel.',
    fr: 'Connecté, mais cet utilisateur Beszel ne voit aucun système : partagez-les avec lui dans Beszel.',
    de: 'Verbunden, aber dieser Beszel-Benutzer sieht kein System: Teile die Systeme in Beszel mit ihm.',
    es: 'Conectado, pero este usuario de Beszel no ve ningún sistema: compártalos con él en Beszel.',
  },
};

// One short explanation per error kind.
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer (is the Beszel hub running?)',
    fr: 'ne répond pas (le hub Beszel est-il lancé ?)',
    de: 'antwortet nicht (läuft der Beszel-Hub?)',
    es: 'no responde (¿se está ejecutando el hub Beszel?)',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'email or password refused',
    fr: 'e-mail ou mot de passe refusé',
    de: 'E-Mail oder Passwort abgelehnt',
    es: 'correo electrónico o contraseña rechazados',
  },
  [ERROR_KINDS.CREDENTIALS_MISSING]: {
    en: 'enter the email and password of a Beszel user',
    fr: "saisissez l'e-mail et le mot de passe d'un utilisateur Beszel",
    de: 'gib E-Mail und Passwort eines Beszel-Benutzers ein',
    es: 'introduzca el correo electrónico y la contraseña de un usuario de Beszel',
  },
  [ERROR_KINDS.NOT_BESZEL]: {
    en: 'no Beszel hub at this address',
    fr: 'aucun hub Beszel à cette adresse',
    de: 'kein Beszel-Hub unter dieser Adresse',
    es: 'no hay ningún hub Beszel en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The status of a system, in words (scene event variable, widget, summaries).
export const STATUS_TEXT = {
  up: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  down: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  pending: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
};

// The state of a Beszel alert, in words.
export const ALERT_STATE_TEXT = {
  triggered: { en: 'Triggered', fr: 'Déclenchée', de: 'Ausgelöst', es: 'Activada' },
  resolved: { en: 'Resolved', fr: 'Résolue', de: 'Behoben', es: 'Resuelta' },
};

// The Beszel alert kinds, in words, and the unit of their threshold.
export const ALERT_NAME_TEXT = {
  Status: { en: 'Status', fr: 'Statut', de: 'Status', es: 'Estado' },
  CPU: { en: 'CPU', fr: 'Processeur', de: 'Prozessor', es: 'Procesador' },
  Memory: { en: 'Memory', fr: 'Mémoire', de: 'Arbeitsspeicher', es: 'Memoria' },
  Disk: { en: 'Disk', fr: 'Disque', de: 'Datenträger', es: 'Disco' },
  Temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  Bandwidth: { en: 'Bandwidth', fr: 'Bande passante', de: 'Bandbreite', es: 'Ancho de banda' },
  GPU: { en: 'GPU', fr: 'GPU', de: 'GPU', es: 'GPU' },
  LoadAvg1: { en: 'Load (1 min)', fr: 'Charge (1 min)', de: 'Last (1 Min.)', es: 'Carga (1 min)' },
  LoadAvg5: { en: 'Load (5 min)', fr: 'Charge (5 min)', de: 'Last (5 Min.)', es: 'Carga (5 min)' },
  LoadAvg15: {
    en: 'Load (15 min)',
    fr: 'Charge (15 min)',
    de: 'Last (15 Min.)',
    es: 'Carga (15 min)',
  },
  Battery: { en: 'Battery', fr: 'Batterie', de: 'Akku', es: 'Batería' },
  ContainerHealth: {
    en: 'Container health',
    fr: 'Santé des conteneurs',
    de: 'Container-Zustand',
    es: 'Salud de los contenedores',
  },
  SystemdFailed: {
    en: 'Failed services',
    fr: 'Services en échec',
    de: 'Fehlgeschlagene Dienste',
    es: 'Servicios con error',
  },
  CPUIOWait: {
    en: 'CPU I/O wait',
    fr: 'Attente E/S du processeur',
    de: 'E/A-Wartezeit',
    es: 'Espera de E/S',
  },
  CPUSteal: { en: 'CPU steal', fr: 'Vol de processeur', de: 'CPU-Steal', es: 'Robo de CPU' },
  NetworkMonitorLoss: {
    en: 'Network monitor loss',
    fr: 'Pertes de la sonde réseau',
    de: 'Verluste der Netzwerkprüfung',
    es: 'Pérdidas del monitor de red',
  },
};

export const ALERT_UNITS = {
  CPU: '%',
  Memory: '%',
  Disk: '%',
  Temperature: '°C',
  Bandwidth: 'MB/s',
  GPU: '%',
  Battery: '%',
  CPUIOWait: '%',
  CPUSteal: '%',
  NetworkMonitorLoss: '%',
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    systems: (up, total) => `${up}/${total} system(s) online`,
    alerts: (count) => `${count} alert(s) triggered`,
    readonly: 'read-only user',
  },
  fr: {
    ok: 'OK',
    systems: (up, total) => `${up}/${total} système(s) en ligne`,
    alerts: (count) => `${count} alerte(s) déclenchée(s)`,
    readonly: 'utilisateur en lecture seule',
  },
  de: {
    ok: 'OK',
    systems: (up, total) => `${up}/${total} System(e) online`,
    alerts: (count) => `${count} ausgelöste(r) Alarm(e)`,
    readonly: 'Benutzer mit Lesezugriff',
  },
  es: {
    ok: 'OK',
    systems: (up, total) => `${up}/${total} sistema(s) en línea`,
    alerts: (count) => `${count} alerta(s) activada(s)`,
    readonly: 'usuario de solo lectura',
  },
};

// The `summary` outputs of the scene actions, ready for a message.
export const SUMMARY_TEXT = {
  en: {
    cpu: 'CPU',
    memory: 'memory',
    disk: 'disk',
    alerts: (count) => `${count} alert(s) triggered`,
    noAlert: 'no alert triggered',
    allOnline: (count) => `${count} system(s), all online`,
    offline: (names) => `offline: ${names}`,
  },
  fr: {
    cpu: 'processeur',
    memory: 'mémoire',
    disk: 'disque',
    alerts: (count) => `${count} alerte(s) déclenchée(s)`,
    noAlert: 'aucune alerte déclenchée',
    allOnline: (count) => `${count} système(s), tous en ligne`,
    offline: (names) => `hors ligne : ${names}`,
  },
  de: {
    cpu: 'Prozessor',
    memory: 'Arbeitsspeicher',
    disk: 'Datenträger',
    alerts: (count) => `${count} ausgelöste(r) Alarm(e)`,
    noAlert: 'kein ausgelöster Alarm',
    allOnline: (count) => `${count} System(e), alle online`,
    offline: (names) => `offline: ${names}`,
  },
  es: {
    cpu: 'procesador',
    memory: 'memoria',
    disk: 'disco',
    alerts: (count) => `${count} alerta(s) activada(s)`,
    noAlert: 'ninguna alerta activada',
    allOnline: (count) => `${count} sistema(s), todos en línea`,
    offline: (names) => `sin conexión: ${names}`,
  },
};

// Errors of the scene actions (shown in Gladys).
export const ACTION_TEXT = {
  noHub: {
    en: 'No Beszel hub is configured.',
    fr: "Aucun hub Beszel n'est configuré.",
    de: 'Kein Beszel-Hub ist konfiguriert.',
    es: 'No hay ningún hub Beszel configurado.',
  },
  unknownSystem: {
    en: 'This device is not a system of the configured Beszel hub.',
    fr: "Cet appareil n'est pas un système du hub Beszel configuré.",
    de: 'Dieses Gerät ist kein System des konfigurierten Beszel-Hubs.',
    es: 'Este dispositivo no es un sistema del hub Beszel configurado.',
  },
};

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** The name of a Beszel alert kind, the raw name for a kind added later. */
export const alertLabel = (name, language) =>
  ALERT_NAME_TEXT[name] ? pick(ALERT_NAME_TEXT[name], language) : name;

/** A number written the way the language writes it (decimal comma in fr, de, es). */
export const formatNumber = (value, language, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

/** "12 %" (fr, de, es) or "12%" (en). */
export const formatPercent = (value, language) =>
  `${formatNumber(value, language, 0)}${language === 'en' ? '%' : ' %'}`;

/** A temperature, "52 °C". */
export const formatCelsius = (value, language) => `${formatNumber(value, language, 0)} °C`;

/** "CPU > 80 %": an alert and its threshold, in words. */
export function alertText(alert, language) {
  const label = alertLabel(alert.name, language);
  if (alert.name === 'Status' || alert.threshold === null) {
    return label;
  }
  const unit = ALERT_UNITS[alert.name];
  const value = formatNumber(alert.threshold, language, 2);
  const spaced =
    unit === '%' && language === 'en' ? `${value}%` : unit ? `${value} ${unit}` : value;
  return `${label} > ${spaced}`;
}

/** An uptime, "4 d 3 h" / "4 j 3 h" / "4 T 3 Std." / "4 d 3 h". */
export function formatUptime(seconds, language) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const day = { en: 'd', fr: 'j', de: 'T', es: 'd' }[language] ?? 'd';
  const hour = language === 'de' ? 'Std.' : 'h';
  if (days > 0) {
    return `${days} ${day} ${hours} ${hour}`;
  }
  if (hours > 0) {
    return `${hours} ${hour} ${minutes} min`;
  }
  return `${minutes} min`;
}
