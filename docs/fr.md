# Beszel

[Beszel](https://beszel.dev) est un outil léger de supervision de serveurs : un
petit agent sur chaque machine envoie ses mesures à un **hub**, qui garde
l'historique, affiche le tableau de bord et lève des alertes. Cette intégration
lit votre hub Beszel et amène vos systèmes dans Gladys : un appareil par
système, qui dit s'il est en ligne, avec son processeur, sa mémoire, son
disque, sa température la plus haute, son trafic réseau, sa charge, sa durée de
fonctionnement, ses services en échec et les alertes Beszel déclenchées. Les
scènes peuvent réagir quand un système passe hors ligne ou revient, et quand
une alerte Beszel se déclenche ou se résout ; un widget de tableau de bord
montre vos systèmes d'un coup d'œil. Tout reste sur votre réseau local.

Testée contre un vrai hub Beszel 0.21.0 et son agent (Docker), avec un système
arrêté puis relancé et des alertes déclenchées puis résolues. Pas encore sur
toutes les installations : vos retours sont les bienvenus sur
[les issues](https://github.com/guim31/gladys-beszel/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un hub Beszel (0.12 ou plus récent, 0.21 testé) joignable depuis la machine
  de Gladys (port 8090 par défaut), avec ses agents déjà ajoutés.
- L'e-mail et le mot de passe d'un utilisateur Beszel. Le mieux : un
  utilisateur créé pour Gladys, au rôle **lecture seule**.

L'intégration ne fait que lire : elle ne change jamais rien dans Beszel ni sur
vos machines.

## Pour commencer

### 1. Créer un utilisateur Beszel pour Gladys

L'intégration voit exactement ce que voit son utilisateur : les systèmes
partagés avec lui, et **ses propres alertes**.

1. Ouvrez le panneau d'administration de PocketBase, à `http://<hub>:8090/_/`
   (menu de Beszel → **Users** dans les versions récentes), et créez un
   utilisateur dans la collection `users` : un e-mail, un mot de passe, le rôle
   `readonly`, la case `verified` cochée.
2. Partagez les systèmes avec lui : soit en lançant le hub avec la variable
   d'environnement `SHARE_ALL_SYSTEMS=true` (chaque utilisateur voit tous les
   systèmes), soit, dans le même panneau, en ajoutant l'utilisateur au champ
   `users` de chaque système.
3. Les alertes Beszel appartiennent à un utilisateur : connectez-vous à Beszel
   avec cet utilisateur et réglez les alertes que les scènes doivent connaître
   (icône de cloche d'un système). Un utilisateur en lecture seule peut gérer
   ses propres alertes.

Vous pouvez aussi utiliser votre propre compte Beszel : l'intégration voit
alors vos systèmes et vos alertes.

### 2. Configurer l'intégration

Dans l'onglet **Configuration** de l'intégration :

- **Adresse de Beszel** : l'adresse du hub, celle que vous ouvrez dans un
  navigateur : `192.168.1.20` (port 8090 ajouté), `nas.lan:8090` ou
  `https://beszel.example.com`.
- **E-mail de l'utilisateur Beszel** et **Mot de passe**.
- **Intervalle de rafraîchissement** : 30 secondes par défaut. Le hub lit
  lui-même ses agents une fois par minute : un intervalle plus court
  n'apporte rien.
- **Accepter les certificats auto-signés** : seulement pour une adresse en
  `https://` dont votre navigateur ne reconnaît pas non plus le certificat.
- **Langue des noms** : langue des noms des fonctionnalités, fixés à l'ajout
  d'un appareil, et des textes envoyés aux scènes.

Enregistrez, puis cliquez sur **Tester la connexion** : il donne la version de
Beszel, le nombre de systèmes en ligne et le nombre d'alertes déclenchées.

### 3. Ajouter les systèmes

Ouvrez l'onglet **Découverte** : chaque système de l'utilisateur y est listé.
Ajoutez ceux que vous voulez suivre. Les déclencheurs de scène fonctionnent
pour tous les systèmes, ajoutés ou non.

## Les appareils

Chaque système est un appareil, nommé comme dans Beszel. Ses fonctionnalités :

- **En ligne** : 1 tant que Beszel marque le système en ligne, 0 quand il le
  marque hors ligne. Un système en pause n'envoie rien.
- **Processeur**, **Mémoire** et **Disque** : l'utilisation, en %, du
  processeur, de la mémoire et du disque racine.
- **Température la plus haute** : la température que Beszel affiche sur son
  tableau de bord (le capteur le plus chaud), en °C, quand le système a des
  capteurs.
- **Trafic réseau** : envoi et réception ensemble, en Mbit/s.
- **Charge (1 min)**, **Charge (5 min)**, **Charge (15 min)** : les charges
  moyennes.
- **Durée de fonctionnement** : en jours.
- **Services en échec** : les services systemd en échec, quand l'agent les
  surveille.
- **Alertes déclenchées** : combien d'alertes Beszel de l'utilisateur sont
  déclenchées sur ce système.

Les valeurs qui bougent tout le temps (processeur, mémoire, charge, réseau,
température) partent vers Gladys au plus une fois par minute, les autres quand
elles changent. Tant qu'un système est hors ligne, seuls **En ligne** et
**Alertes déclenchées** sont mis à jour : les derniers chiffres restent.

## Tableau de bord

Ajoutez le widget **Systèmes Beszel** à un tableau de bord :

- sans système choisi dans ses réglages, il montre combien de systèmes sont en
  ligne et hors ligne et combien d'alertes sont déclenchées, puis une ligne
  par système, rouge s'il est hors ligne, orange avec une alerte déclenchée ;
- avec un système choisi, il montre ses jauges de processeur, de mémoire et de
  disque, sa température, ses alertes déclenchées, sa charge et sa durée de
  fonctionnement.

Le bouton **Actualiser** relit Beszel aussitôt.

## Scènes

### Déclencheurs

- **Système Beszel hors ligne ou revenu** : Beszel marque un système hors
  ligne (son agent ne répond plus) ou de nouveau en ligne. Filtres : le
  système et le nouvel état (**Hors ligne**, **De nouveau en ligne**). Les
  actions peuvent utiliser le nom du système et le nouvel état. C'est Beszel
  qui décide quand un système est hors ligne ; un système en pause ne
  déclenche rien.
- **Alerte Beszel** : une alerte Beszel de l'utilisateur se déclenche ou se
  résout. Filtres : le système, l'alerte (**Processeur**, **Mémoire**,
  **Disque**, **Température**, **Statut**…) et le nouvel état
  (**Déclenchée**, **Résolue**). Les actions peuvent utiliser le nom du
  système, l'alerte, l'alerte avec son seuil (`Processeur > 80 %`), le nouvel
  état et le seuil.

Les seuils et les durées des alertes se règlent dans Beszel, pas dans Gladys.
Les états trouvés au démarrage de l'intégration sont son point de départ :
seuls les changements suivants déclenchent une scène, y compris d'un
redémarrage de Gladys à l'autre.

### Actions

- **État d'un système Beszel** : lit un système et donne aux actions suivantes
  ses chiffres (en ligne, processeur, mémoire, disque, température, réseau,
  charge, durée de fonctionnement, alertes déclenchées) et un résumé prêt à
  envoyer, par exemple
  `nas : processeur 12 %, mémoire 45 %, disque 78 %, 48 °C, aucune alerte déclenchée`.
- **État de tous les systèmes Beszel** : compte les systèmes en ligne et hors
  ligne et les alertes déclenchées, avec un résumé à envoyer, par exemple
  `Hors ligne : pi` puis `nas : 1 alerte(s) déclenchée(s) (Disque > 90 %)`.

### Idées de scènes

- **Système Beszel hors ligne ou revenu**, état **Hors ligne** → envoyer le
  message `{{triggerEvent.data.system_name}} est hors ligne`.
- **Alerte Beszel**, alerte **Température**, état **Déclenchée** → allumer le
  ventilateur du local technique.
- Chaque matin à 8 h → **État de tous les systèmes Beszel** → envoyer le
  résumé.

## Dépannage

- **« ne répond pas »** : vérifiez l'adresse et le port dans un navigateur ;
  un pare-feu peut bloquer le port 8090.
- **« e-mail ou mot de passe refusé »** : connectez-vous à Beszel avec eux pour
  vérifier. Un superutilisateur de PocketBase (le compte d'administration de
  `/_/`) n'est pas un utilisateur Beszel : prenez un compte de la collection
  `users`.
- **« Connecté, mais cet utilisateur Beszel ne voit aucun système »** :
  partagez les systèmes avec l'utilisateur (étape 1) ou réglez
  `SHARE_ALL_SYSTEMS=true`.
- **Aucune alerte ne se déclenche jamais** : les alertes appartiennent à
  l'utilisateur avec lequel l'intégration se connecte : réglez-les dans Beszel
  avec cet utilisateur.
- **« aucun hub Beszel à cette adresse »** : un autre service répond à cette
  adresse (une autre application, un proxy inverse sans Beszel derrière).
- **Pas de température** : l'agent ne lit aucun capteur (une machine
  virtuelle, ou un agent dans Docker sans accès aux capteurs).
- Plus de détails avec la variable d'environnement `LOG_LEVEL=debug` sur
  l'intégration.

## Limites

- Un hub Beszel par installation, 100 systèmes au plus.
- Le résumé de chaque système seulement : les conteneurs, les disques
  supplémentaires, le GPU et l'historique de Beszel ne sont pas lus.
- Seules les alertes de l'utilisateur configuré sont vues.
- Lecture toutes les 30 secondes à 5 minutes, pas en temps réel : le hub
  rafraîchit lui-même un système une fois par minute.
- Sans lien avec Beszel ni ses auteurs.
