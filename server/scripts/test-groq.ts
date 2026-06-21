/**
 * Diagnostic Groq : vérifie que la clé et le modèle fonctionnent.
 *
 * Usage :
 *   GROQ_API_KEY=gsk_xxx npx tsx scripts/test-groq.ts
 *   GROQ_API_KEY=gsk_xxx GROQ_MODEL=llama-3.1-8b-instant npx tsx scripts/test-groq.ts
 */

const key = process.env.GROQ_API_KEY;
const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!key) {
  console.error('❌ GROQ_API_KEY manquante. Lance : GROQ_API_KEY=gsk_xxx npx tsx scripts/test-groq.ts');
  process.exit(1);
}

console.log(`→ Modèle : ${model}`);
console.log('→ Test 1/2 : liste des modèles disponibles…');

try {
  const list = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!list.ok) {
    console.error(`❌ Clé invalide ? HTTP ${list.status} ${list.statusText}`);
    console.error(await list.text());
    process.exit(1);
  }
  const data = (await list.json()) as { data?: { id: string }[] };
  const ids = (data.data ?? []).map((m) => m.id);
  console.log(`✅ Clé valide. ${ids.length} modèles accessibles.`);
  if (!ids.includes(model)) {
    console.warn(`⚠️  Le modèle "${model}" n'est PAS dans la liste. Modèles utiles :`);
    console.warn('   ' + ids.filter((i) => i.includes('llama')).join(', '));
  }
} catch (e) {
  console.error('❌ Erreur réseau en listant les modèles :', e);
  process.exit(1);
}

console.log('→ Test 2/2 : génération d\'un indice de jeu…');

const started = Date.now();
try {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 12,
      messages: [
        { role: 'system', content: 'Tu joues au jeu Undercover en français.' },
        {
          role: 'user',
          content:
            'Ton mot secret est « carotte ». Donne UN indice (un mot) sans dire le mot. Réponds uniquement par l\'indice.',
        },
      ],
    }),
  });
  const ms = Date.now() - started;
  if (!res.ok) {
    console.error(`❌ Échec de génération : HTTP ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  console.log(`✅ Réponse en ${ms} ms : « ${content} »`);
  console.log('\n🎉 Groq fonctionne. Les joueurs IA utiliseront ce modèle.');
} catch (e) {
  console.error('❌ Erreur réseau pendant la génération :', e);
  process.exit(1);
}
