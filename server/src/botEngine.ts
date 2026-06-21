/**
 * Moteur de joueurs IA (bots).
 *
 * Les bots se comportent comme des joueurs : ils lisent les indices écrits par
 * les autres, donnent leur propre indice à leur tour (selon leur mot + leur rôle),
 * votent pour leur survie et, s'ils sont Mr. White, tentent de deviner le mot.
 *
 * L'IA est pilotée par Groq (gratuit). En l'absence de clé GROQ_API_KEY ou en cas
 * d'échec réseau, un repli heuristique garantit que la partie continue d'avancer.
 *
 * Le moteur est réveillé par `onGameStateChanged(roomId)` après chaque changement
 * d'état de partie. Il planifie les actions des bots avec un petit délai « humain »
 * et rediffuse l'état via le callback `setBotBroadcast`.
 */

import {
  getBotContext,
  roomHasBots,
  applyBotClue,
  applyBotVote,
  applyBotMrWhiteGuess,
  applyBotContinueAfterEliminated,
  type BotContext,
  type BotPlayerInfo,
} from './roomStore.js';
import type { RoomGameState } from './types.js';
import { groqChat, isGroqConfigured, type ChatMessage } from './groq.js';

const VOTE_BLANK = 'BLANK';

let broadcast: ((roomId: string, state: RoomGameState) => void) | null = null;

/** Injecté par index.ts : rediffuse l'état de la room à tous les clients. */
export function setBotBroadcast(fn: (roomId: string, state: RoomGameState) => void): void {
  broadcast = fn;
}

/** Clés des actions déjà planifiées (anti-double-planification). */
const startedActions = new Set<string>();

function clearRoomActions(roomId: string): void {
  for (const key of startedActions) {
    if (key.startsWith(`${roomId}:`)) startedActions.delete(key);
  }
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clueDelayMs = () => rand(2500, 6500);
const voteDelayMs = () => rand(3000, 8000);
const guessDelayMs = () => rand(3000, 6000);
const continueDelayMs = () => rand(1500, 3500);

function runOnce(key: string, delayMs: number, fn: () => Promise<void> | void): void {
  if (startedActions.has(key)) return;
  startedActions.add(key);
  setTimeout(() => {
    void Promise.resolve(fn()).catch(() => {});
  }, delayMs);
}

/** Point d'entrée : appelé après chaque diffusion d'un état de partie. */
export function onGameStateChanged(roomId: string): void {
  if (!roomHasBots(roomId)) return;
  const ctx = getBotContext(roomId);
  if (!ctx) return;
  scheduleForContext(ctx);
}

function scheduleForContext(ctx: BotContext): void {
  const { roomId, phase } = ctx;

  if (phase === 'end') {
    clearRoomActions(roomId);
    return;
  }

  if (phase === 'discussion' && ctx.currentSpeaker) {
    const speaker = ctx.currentSpeaker;
    const key = `${roomId}:clue:${ctx.discussionStartedAt ?? 0}:${ctx.currentSpeakerIndex ?? 0}`;
    runOnce(key, clueDelayMs(), () => doBotClue(roomId, speaker));
    return;
  }

  if (phase === 'vote') {
    for (const bot of ctx.botsToVote) {
      const key = `${roomId}:vote:${ctx.voteStartedAt ?? 0}:${bot.playerId}`;
      runOnce(key, voteDelayMs(), () => doBotVote(roomId, bot));
    }
    return;
  }

  if (phase === 'mrWhiteGuess' && ctx.mrWhiteToGuess) {
    const bot = ctx.mrWhiteToGuess;
    const key = `${roomId}:mrwhite:${ctx.eliminatedPlayerId ?? ''}`;
    runOnce(key, guessDelayMs(), () => doBotGuess(roomId, bot));
    return;
  }

  if (phase === 'eliminatedReveal' && ctx.botToContinue) {
    const botId = ctx.botToContinue;
    const key = `${roomId}:continue:${ctx.eliminatedPlayerId ?? ''}`;
    runOnce(key, continueDelayMs(), () => doBotContinue(roomId, botId));
  }
}

// --- Actions ---

async function doBotClue(roomId: string, bot: BotPlayerInfo): Promise<void> {
  const ctx = getBotContext(roomId);
  if (!ctx || ctx.phase !== 'discussion' || ctx.currentSpeaker?.playerId !== bot.playerId) return;
  const clue = await generateClue(bot, ctx);
  const state = applyBotClue(roomId, bot.playerId, clue);
  if (state && broadcast) broadcast(roomId, state);
}

async function doBotVote(roomId: string, bot: BotPlayerInfo): Promise<void> {
  const ctx = getBotContext(roomId);
  if (!ctx || ctx.phase !== 'vote') return;
  if (!ctx.botsToVote.some((b) => b.playerId === bot.playerId)) return;
  const targetId = await decideVote(bot, ctx);
  const res = applyBotVote(roomId, bot.playerId, targetId);
  if (res && broadcast) broadcast(roomId, res.roomState);
}

async function doBotGuess(roomId: string, bot: BotPlayerInfo): Promise<void> {
  const ctx = getBotContext(roomId);
  if (!ctx || ctx.phase !== 'mrWhiteGuess' || ctx.mrWhiteToGuess?.playerId !== bot.playerId) return;
  const guess = await generateGuess(ctx);
  const state = applyBotMrWhiteGuess(roomId, bot.playerId, guess);
  if (state && broadcast) broadcast(roomId, state);
}

function doBotContinue(roomId: string, botId: string): void {
  const state = applyBotContinueAfterEliminated(roomId, botId);
  if (state && broadcast) broadcast(roomId, state);
}

// --- Prompts & génération ---

const SYSTEM_RULES = `Tu joues à « Imposteur » (type Undercover) en français.
Règles : les Citoyens partagent un mot secret commun. L'Imposteur a un mot proche mais différent. Mr. White n'a aucun mot.
À chaque tour, chacun donne UN indice (un mot ou une très courte expression) en rapport avec son mot, sans jamais dire le mot lui-même.
Les Citoyens veulent démasquer l'Imposteur et Mr. White en repérant les indices qui détonnent.
L'Imposteur et Mr. White veulent se fondre dans la masse sans se faire repérer.

Raisonne comme un vrai joueur humain, fin et stratégique :
- Tu as de la MÉMOIRE : prends en compte TOUS les indices des tours précédents, pas seulement le dernier.
- Comprends les indices indirects et les jeux de mots (ex : « mario » peut évoquer « banane » via le champignon/le jeu). Un indice détourné mais qui colle au mot n'est PAS suspect, au contraire.
- Le 1er indice d'un joueur est le plus révélateur, mais ce n'est pas décisif : un bon indice plus tard peut le disculper, un mauvais peut le trahir. Ton avis évolue.
- Répéter mot pour mot un indice déjà donné est un peu louche (signe d'un joueur qui n'a pas le mot).
Tu réponds toujours en français, de façon très concise.`;

/** Numéro de tour le plus élevé déjà présent dans l'historique. */
function maxRound(ctx: BotContext): number {
  return ctx.clueHistory.reduce((m, c) => Math.max(m, c.round), 0);
}

/** Historique complet groupé par tour, pour donner de la mémoire à l'IA. */
function historyToText(ctx: BotContext): string {
  if (ctx.clueHistory.length === 0) {
    return "(aucun indice pour l'instant : tu es parmi les premiers à parler)";
  }
  const rounds = [...new Set(ctx.clueHistory.map((c) => c.round))].sort((a, b) => a - b);
  return rounds
    .map((r) => {
      const line = ctx.clueHistory
        .filter((c) => c.round === r)
        .map((c) => `  - ${c.name} : ${c.text}`)
        .join('\n');
      return `Tour ${r} :\n${line}`;
    })
    .join('\n');
}

/** Ensemble (minuscule) de tous les indices déjà donnés sur la manche. */
function usedCluesLower(ctx: BotContext): Set<string> {
  return new Set(ctx.clueHistory.map((c) => c.text.toLowerCase()));
}

function buildClueStrategy(bot: BotPlayerInfo, ctx: BotContext): string {
  const late = maxRound(ctx) >= 2;
  if (bot.role === 'imposteur') {
    return `Ton rôle : IMPOSTEUR. Ton mot est « ${bot.word} » (proche mais DIFFÉRENT du mot des Citoyens).
- Sers-toi des indices des joueurs qui semblent sincères pour DEVINER le vrai mot des Citoyens.
- Donne un indice qui colle à ce mot deviné (pas forcément au tien) pour te fondre dans la masse.
- ${late ? "On avance dans la partie : tu peux être un peu plus précis et, si tu te sens visé, orienter discrètement les soupçons vers un Citoyen crédible." : 'Début de partie : reste prudent et un peu vague, ne te démarque pas.'}
- Ne révèle jamais que ton mot diffère.`;
  }
  if (bot.role === 'mrWhite') {
    return `Ton rôle : MR. WHITE. Tu n'as AUCUN mot.
- Déduis À TOUT PRIX le mot des Citoyens à partir des indices des joueurs qui semblent sincères.
- Donne un indice plausible : un SYNONYME ou une association proche des indices déjà donnés par ceux que tu penses Citoyens, sans recopier un indice existant.
- ${late ? "Tu commences à cerner le thème : ose un indice un peu plus ciblé, mais sans te trahir." : "Tu n'as encore que peu d'indices : reste générique et plausible."}`;
  }
  return `Ton rôle : CITOYEN. Ton mot secret est « ${bot.word} ».
- Donne un indice lié à « ${bot.word} » : un mot ou une très courte expression.
- Tu peux être malin/indirect (association, jeu de mots) tant que ça reste rattachable à « ${bot.word} ».
- Ne sois PAS trop évident (l'Imposteur ou Mr. White pourrait deviner le mot).
- Reste cohérent avec tes propres indices passés et avec le thème déjà installé.`;
}

/** Nettoie une réponse IA pour en faire un indice court (1 à 3 mots). */
function sanitizeClue(raw: string | null): string {
  if (!raw) return '';
  let s = raw.split('\n')[0].trim();
  s = s.replace(/^["'«»\-–—\s.:]+|["'«»\s.:!?]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  if (words.length > 3) s = words.slice(0, 3).join(' ');
  return s.slice(0, 40);
}

async function generateClue(bot: BotPlayerInfo, ctx: BotContext): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_RULES },
    {
      role: 'user',
      content: `${buildClueStrategy(bot, ctx)}

Historique des indices (du plus ancien au plus récent) :
${historyToText(ctx)}

Donne TON indice pour ce tour : un seul mot ou une très courte expression (3 mots maximum), en français.
IMPORTANT : ne répète AUCUN indice déjà donné ci-dessus (ni le tien, ni celui d'un autre, à aucun tour). Apporte quelque chose de nouveau.
N'écris QUE l'indice, sans ponctuation ni explication.`,
    },
  ];
  const raw = sanitizeClue(await groqChat(messages, { temperature: 0.85, maxTokens: 16 }));
  // Garde-fou anti-répétition : si l'IA recopie un indice existant (ou échoue), on bascule sur un repli non répété.
  if (!raw || usedCluesLower(ctx).has(raw.toLowerCase())) {
    return fallbackClue(ctx);
  }
  return raw;
}

/** Repli sans IA : un indice générique non répété (mieux que de rester muet). */
function fallbackClue(ctx: BotContext): string {
  const generic = ['intéressant', 'classique', 'courant', 'logique', 'pas évident', 'connu', 'banal', 'particulier'];
  const used = usedCluesLower(ctx);
  const available = generic.filter((g) => !used.has(g));
  const pool = available.length ? available : generic;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Score minimal de suspicion pour qu'un Citoyen ose voter (sinon : abstention/blanc). */
const CITIZEN_VOTE_THRESHOLD = 55;

function buildVoteStrategy(bot: BotPlayerInfo, ctx: BotContext): string {
  const late = maxRound(ctx) >= 2;
  if (bot.role === 'imposteur') {
    return `Ton rôle : IMPOSTEUR (ton mot est « ${bot.word} », différent de celui des Citoyens). Tu veux SURVIVRE.
À partir de l'historique, devine le mot des Citoyens, puis repère le Citoyen le plus crédible/menaçant.
${late ? 'Tu te sens peut-être visé : oriente le vote vers ce Citoyen menaçant pour te protéger.' : "Reste discret : vote pour un joueur déjà suspect aux yeux du groupe, ou BLANC si c'est plus prudent."}
Ne te désigne JAMAIS.`;
  }
  if (bot.role === 'mrWhite') {
    return `Ton rôle : MR. WHITE (sans mot). Tu veux SURVIVRE.
Fonds-toi dans la masse : vote pour un joueur dont l'indice détonne, ou pour détourner les soupçons d'un Citoyen crédible. Vote BLANC si tu n'as aucune certitude.
Ne te désigne JAMAIS.`;
  }
  return `Ton rôle : CITOYEN (ton mot est « ${bot.word} »). Tu veux éliminer l'Imposteur ou Mr. White.
Repère le joueur dont les indices collent le moins à « ${bot.word} » (hors-sujet, trop vague, ou répétition suspecte).
Ne vote contre quelqu'un que s'il se démarque NETTEMENT comme suspect ; sinon vote BLANC (mieux vaut s'abstenir que d'accuser au hasard).`;
}

/** Associe une réponse (prénom ou « blanc ») à un playerId, à VOTE_BLANK, ou null si introuvable. */
function matchVoteTarget(raw: string | null, others: { id: string; name: string }[]): string | null {
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (low.includes('blanc') || low.includes('personne') || low.includes('aucun')) {
    return VOTE_BLANK;
  }
  for (const p of others) {
    if (low.includes(p.name.toLowerCase())) return p.id;
  }
  return null;
}

interface VoteAnalysis {
  mot_probable?: string;
  scores?: { joueur?: string; suspicion?: number }[];
  vote?: string;
}

/** Parse une réponse JSON éventuellement entourée de texte. */
function parseVoteJson(raw: string | null): VoteAnalysis | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoteAnalysis;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as VoteAnalysis;
    } catch {
      return null;
    }
  }
}

/** Retrouve le score de suspicion attribué à un joueur dans l'analyse. */
function suspicionFor(analysis: VoteAnalysis, name: string): number | null {
  if (!analysis.scores) return null;
  const low = name.toLowerCase();
  for (const s of analysis.scores) {
    if (s.joueur && s.joueur.toLowerCase().includes(low) && typeof s.suspicion === 'number') {
      return s.suspicion;
    }
  }
  return null;
}

async function decideVote(bot: BotPlayerInfo, ctx: BotContext): Promise<string> {
  const others = ctx.alive.filter((p) => p.id !== bot.playerId);
  if (others.length === 0) return VOTE_BLANK;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_RULES },
    {
      role: 'user',
      content: `${buildVoteStrategy(bot, ctx)}

Historique complet des indices (le 1er tour est le plus révélateur, mais ton avis peut évoluer avec la suite) :
${historyToText(ctx)}

Joueurs encore en jeu (tu ne peux voter que contre eux) :
${others.map((p) => `- ${p.name}`).join('\n')}

Analyse : déduis le mot probable des Citoyens, puis attribue à CHAQUE joueur ci-dessus un score de suspicion de 0 (parfaitement cohérent/innocent) à 100 (très suspect). Récompense les indices indirects mais justes (faible suspicion) ; pénalise les indices hors-sujet, trop vagues ou répétés.
Puis choisis ton vote selon ta stratégie de rôle.

Réponds UNIQUEMENT en JSON valide, sans aucun texte autour, au format :
{"mot_probable":"<mot>","scores":[{"joueur":"<prénom>","suspicion":<0-100>}],"vote":"<prénom exact d'un joueur ou BLANC>"}`,
    },
  ];

  const analysis = parseVoteJson(
    await groqChat(messages, { temperature: 0.5, maxTokens: 400, json: true })
  );
  if (!analysis) return fallbackVote(bot, others);

  const target = matchVoteTarget(analysis.vote ?? null, others);
  if (target === null) return fallbackVote(bot, others);
  if (target === VOTE_BLANK) return VOTE_BLANK;

  // Garde-fou citoyen : ne pas accuser sans certitude suffisante (abstention si le score est trop bas).
  if (bot.role === 'citoyen') {
    const name = others.find((o) => o.id === target)?.name ?? '';
    const score = suspicionFor(analysis, name);
    if (score !== null && score < CITIZEN_VOTE_THRESHOLD) return VOTE_BLANK;
  }
  return target;
}

/** Repli sans IA : l'imposteur/Mr White se met en retrait (blanc), le citoyen tente sa chance. */
function fallbackVote(bot: BotPlayerInfo, others: { id: string }[]): string {
  if (bot.role !== 'citoyen') return VOTE_BLANK;
  return others[Math.floor(Math.random() * others.length)].id;
}

async function generateGuess(ctx: BotContext): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_RULES },
    {
      role: 'user',
      content: `Tu es Mr. White et tu viens d'être éliminé. Dernière chance : devine le mot secret des Citoyens.
Sers-toi de TOUT l'historique ci-dessous. Cherche le mot commun derrière ces indices, en tenant compte des associations et jeux de mots (ex : si les indices pointent indirectement vers une chose précise, trouve-la).

Historique des indices :
${historyToText(ctx)}

Quel est, selon toi, le mot des Citoyens ? Réponds UNIQUEMENT par un seul mot, sans ponctuation.`,
    },
  ];
  const guess = sanitizeClue(await groqChat(messages, { temperature: 0.5, maxTokens: 8 }));
  return guess || 'inconnu';
}

/** À appeler au démarrage : avertit si des bots seront utilisés sans clé Groq. */
export function warnIfGroqMissing(): void {
  if (!isGroqConfigured()) {
    console.warn(
      '[bots] GROQ_API_KEY absente : les joueurs IA fonctionneront en mode repli (indices génériques). ' +
        'Définis GROQ_API_KEY pour des bots crédibles.'
    );
  }
}
