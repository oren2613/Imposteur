/**
 * Test d'intégration (sans Groq) : vérifie qu'un joueur seul voit la file se
 * compléter d'un bot à chaque intervalle, jusqu'au démarrage à 4.
 *
 * Usage : npx tsx scripts/test-matchmaking-bots.ts
 */

// Intervalle court pour le test (le défaut est 20 s).
process.env.BOT_ADD_INTERVAL_MS = '300';
process.env.BOTS_ENABLED = '1';

const mm = await import('../src/matchmaking.js');
const store = await import('../src/roomStore.js');

let formedRoomId: string | null = null;

mm.setMatchmakingTimeoutHandler(() => {
  const added = mm.addBotToQueueIfWaiting();
  if (added) console.log(`  + bot ajouté → file = ${mm.getMatchmakingQueueSize()}/${mm.MATCH_PREFERRED}`);
  const match = mm.tryFormMatchmaking();
  if (match) {
    formedRoomId = match.roomId;
    return;
  }
  mm.scheduleMatchmakingTimeout();
});

console.log('Joueur « Alice » lance une recherche, seul…');
const res = mm.addToMatchmakingQueue('socket-alice', 'Alice', 'sess-alice');
console.log(`File initiale = ${mm.getMatchmakingQueueSize()}/${mm.MATCH_PREFERRED}`, res.ok ? '' : res);

const deadline = Date.now() + 5000;
while (!formedRoomId && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 100));
}

if (!formedRoomId) {
  console.error('❌ Aucune partie formée dans le temps imparti.');
  process.exit(1);
}

const lobby = store.getLobbyState(formedRoomId) ?? store.getRoomMemberSnapshot(formedRoomId);
console.log(`\n✅ Partie formée (room ${formedRoomId}). Membres :`);
for (const m of lobby?.members ?? []) {
  console.log(`   - ${m.name}${m.isBot ? '  [IA]' : '  (humain)'}${m.isHost ? '  (hôte)' : ''}`);
}

const humans = (lobby?.members ?? []).filter((m) => !m.isBot).length;
const bots = (lobby?.members ?? []).filter((m) => m.isBot).length;
console.log(`\nRésumé : ${humans} humain(s) + ${bots} bot(s) = ${humans + bots}.`);
if (humans === 1 && bots === 3) {
  console.log('🎉 Comportement attendu : 1 humain complété par 3 bots.');
  process.exit(0);
}
console.error('❌ Composition inattendue.');
process.exit(1);
