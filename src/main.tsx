import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameProvider } from './context/GameContext'
import { AuthProvider } from './context/AuthContext'
import { OnlineProvider } from './context/OnlineContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <AuthProvider>
        <OnlineProvider>
          <App />
        </OnlineProvider>
      </AuthProvider>
    </GameProvider>
  </StrictMode>,
)
