import { useGame } from './context/GameContext';
import { useDarkMode } from './hooks/useDarkMode';
import { HomeScreen } from './screens/HomeScreen';
import { ConfigScreen } from './screens/ConfigScreen';
import { RoleRevealScreen } from './screens/RoleRevealScreen';
import { DiscussionScreen } from './screens/DiscussionScreen';
import { VoteScreen } from './screens/VoteScreen';
import { EliminatedRevealScreen } from './screens/EliminatedRevealScreen';
import { MrWhiteGuessScreen } from './screens/MrWhiteGuessScreen';
import { EndGameScreen } from './screens/EndGameScreen';
import { RulesScreen } from './screens/RulesScreen';
import { HistoryScreen } from './screens/HistoryScreen';

function AppContent() {
  const { state } = useGame();
  const phase = state.phase;

  if (phase === 'home') return <HomeScreen />;
  if (phase === 'rules') return <RulesScreen />;
  if (phase === 'history') return <HistoryScreen />;
  if (phase === 'config') return <ConfigScreen />;
  if (phase === 'roleReveal') return <RoleRevealScreen />;
  if (phase === 'discussion') return <DiscussionScreen />;
  if (phase === 'vote') return <VoteScreen />;
  if (phase === 'eliminatedReveal') return <EliminatedRevealScreen />;
  if (phase === 'mrWhiteGuess') return <MrWhiteGuessScreen />;
  if (phase === 'end') return <EndGameScreen />;

  return <HomeScreen />;
}

function DarkModeToggle() {
  const [dark, setDark] = useDarkMode();
  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
      aria-label={dark ? 'Mode clair' : 'Mode sombre'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

export default function App() {
  return (
    <>
      <DarkModeToggle />
      <AppContent />
    </>
  );
}
