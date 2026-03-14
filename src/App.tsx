import { Sun, Moon } from 'lucide-react';
import { useGame } from './context/GameContext';
import { useOnline } from './context/OnlineContext';
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
import { OnlineCreateOrJoinScreen } from './screens/OnlineCreateOrJoinScreen';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen';
import { OnlineRoleRevealScreen } from './screens/OnlineRoleRevealScreen';
import { OnlineDiscussionScreen } from './screens/OnlineDiscussionScreen';
import { OnlineVoteScreen } from './screens/OnlineVoteScreen';
import { OnlineEliminatedRevealScreen } from './screens/OnlineEliminatedRevealScreen';
import { OnlineMrWhiteGuessScreen } from './screens/OnlineMrWhiteGuessScreen';
import { OnlineEndScreen } from './screens/OnlineEndScreen';

function AppContent() {
  const { state } = useGame();
  const { isReconnecting } = useOnline();
  const phase = state.phase;

  if (isReconnecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400 text-center font-medium">
          Reconnexion en cours…
        </p>
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
  if (phase === 'onlineCreateOrJoin') return <OnlineCreateOrJoinScreen />;
  if (phase === 'onlineLobby') return <OnlineLobbyScreen />;
  if (phase === 'onlineRoleReveal') return <OnlineRoleRevealScreen />;
  if (phase === 'onlineDiscussion') return <OnlineDiscussionScreen />;
  if (phase === 'onlineVote') return <OnlineVoteScreen />;
  if (phase === 'onlineEliminatedReveal') return <OnlineEliminatedRevealScreen />;
  if (phase === 'onlineMrWhiteGuess') return <OnlineMrWhiteGuessScreen />;
  if (phase === 'onlineEnd') return <OnlineEndScreen />;

  return <HomeScreen />;
}

function DarkModeToggle() {
  const [dark, setDark] = useDarkMode();
  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      className="fixed top-4 right-4 z-50 flex items-center justify-center gap-2 w-12 h-12 rounded-2xl border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 shadow-md hover:shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all duration-200 backdrop-blur-sm"
      aria-label={dark ? 'Mode clair' : 'Mode sombre'}
    >
      {dark ? <Sun className="w-5 h-5" strokeWidth={2} /> : <Moon className="w-5 h-5" strokeWidth={2} />}
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
