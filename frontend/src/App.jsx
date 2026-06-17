import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import MatchupPage from './pages/MatchupPage'
import SimulatorPage from './pages/SimulatorPage'
import HomePage from './pages/HomePage'
import GamePreviewPage from './pages/GamePreviewPage'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1, padding: '24px 32px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/matchup/:pitcherId/:batterId" element={<MatchupPage />} />
          <Route path="/simulate/:pitcherId/:batterId" element={<SimulatorPage />} />
          <Route path="/game/:gamePk/:side" element={<GamePreviewPage />} />
        </Routes>
      </main>
    </div>
  )
}
