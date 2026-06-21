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
Tu te comportes comme un vrai joueur humain, naturel et stratégique. Tu réponds toujours en français, de façon très concise.`;

function cluesToText(ctx: BotContext): string {
  if (ctx.clues.length === 0) {
    return "(aucun indice pour l'instant : tu es parmi les premiers à parler)";
  }
  return ctx.clues.map((c) => `- ${c.name} : ${c.text}`).join('\n');
}

function buildClueStrategy(bot: BotPlayerInfo): string {
  if (bot.role === 'imposteur') {
    return `Ton rôle : IMPOSTEUR. Ton mot est « ${bot.word} » (il est différent du mot des Citoyens).
Objectif : ne PAS te faire repérer. Donne un indice prudent et un peu vague, cohérent avec les indices déjà donnés, qui pourrait coller à plusieurs mots du même thème. Évite d'être trop précis.`;
  }
  if (bot.role === 'mrWhite') {
    return `Ton rôle : MR. WHITE. Tu n'as AUCUN mot.
Objectif : devine le thème à partir des indices des autres et donne un indice plausible qui ne te trahit pas. Si tu n'es pas sûr, reste vague et générique.`;
  }
  return `Ton rôle : CITOYEN. Ton mot secret est « ${bot.word} ».
Objectif : montrer subtilement aux autres Citoyens que tu connais le mot, SANS le rendre trop évident (l'Imposteur ou Mr. White pourrait le deviner). Donne un indice lié à « ${bot.word} » mais pas trop direct.`;
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
      content: `${buildClueStrategy(bot)}

Indices déjà donnés ce tour :
${cluesToText(ctx)}

Donne TON indice : un seul mot ou une très courte expression (3 mots maximum), en français. Ne répète pas un indice déjà donné. N'écris QUE l'indice, sans ponctuation ni explication.`,
    },
  ];
  const clue = sanitizeClue(await groqChat(messages, { temperature: 0.9, maxTokens: 12 }));
  return clue || fallbackClue(ctx);
}

/** Repli sans IA : un indice générique non révélateur (mieux que de rester muet). */
function fallbackClue(ctx: BotContext): string {
  const generic = ['intéressant', 'classique', 'courant', 'pareil', 'logique', 'pas évident'];
  const used = new Set(ctx.clues.map((c) => c.text.toLowerCase()));
  const available = generic.filter((g) => !used.has(g));
  return (available.length ? available : generic)[Math.floor(Math.random() * (available.length ? available.length : generic.length))];
}

function buildVoteStrategy(bot: BotPlayerInfo): string {
  if (bot.role === 'imposteur') {
    return `Ton rôle : IMPOSTEUR (ton mot est « ${bot.word} »). Tu veux SURVIVRE.
Détourne les soupçons : vote pour un joueur que le groupe pourrait déjà suspecter, ou vote blanc si c'est plus prudent. Ne te désigne jamais.`;
  }
  if (bot.role === 'mrWhite') {
    return `Ton rôle : MR. WHITE (sans mot). Tu veux SURVIVRE.
Vote pour quelqu'un d'autre afin de te fondre dans la masse, idéalement un joueur dont l'indice semble suspect. Vote blanc si tu n'as aucune idée.`;
  }
  return `Ton rôle : CITOYEN (ton mot est « ${bot.word} »). Tu veux éliminer l'Imposteur ou Mr. White.
Repère le joueur dont l'indice colle le moins à « ${bot.word} » ou reste le plus vague, et vote contre lui. Vote blanc seulement si rien ne ressort.`;
}

/** Associe la réponse IA à un playerId, à VOTE_BLANK, ou null si introuvable. */
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

async function decideVote(bot: BotPlayerInfo, ctx: BotContext): Promise<string> {
  const others = ctx.alive.filter((p) => p.id !== bot.playerId);
  if (others.length === 0) return VOTE_BLANK;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_RULES },
    {
      role: 'user',
      content: `${buildVoteStrategy(bot)}

Indices donnés pendant la partie :
${cluesToText(ctx)}

Joueurs encore en jeu :
${others.map((p) => `- ${p.name}`).join('\n')}

Qui veux-tu éliminer ? Réponds UNIQUEMENT par le prénom exact d'un joueur de la liste, ou par "BLANC" pour ne désigner personne.`,
    },
  ];
  const target = matchVoteTarget(await groqChat(messages, { temperature: 0.6, maxTokens: 10 }), others);
  if (target) return target;
  return fallbackVote(bot, others);
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
      content: `Tu es Mr. White et tu viens d'être éliminé. Dernière chance : devine le mot secret des Citoyens à partir des indices donnés.

Indices :
${cluesToText(ctx)}

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
