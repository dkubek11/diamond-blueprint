import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PlayerSearch from '../components/PlayerSearch'
import TodayGames from '../components/TodayGames'

export default function HomePage() {
  const [pitcher, setPitcher] = useState(null)
  const [batter, setBatter] = useState(null)
  const [tab, setTab] = useState('today')
  const navigate = useNavigate()

  const canGo = pitcher && batter

  return (
    <div style={{ maxWidth: 860, margin: '48px auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.03em' }}>
          Diamond Blueprint
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
          Advanced pitch sequencing intelligence — search any matchup or browse today's games.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['today', "Today's Games"], ['search', 'Matchup Search']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: tab === key ? 'var(--accent2)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--accent2)' : '2px solid transparent',
            marginBottom: -1,
            transition: 'all .15s',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'search' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PlayerSearch
              label="Pitcher"
              placeholder="Search pitcher name…"
              selected={pitcher}
              onSelect={setPitcher}
            />
            <PlayerSearch
              label="Batter"
              placeholder="Search batter name…"
              selected={batter}
              onSelect={setBatter}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button
              disabled={!canGo}
              onClick={() => navigate(`/matchup/${pitcher.id}/${batter.id}`)}
              style={btnStyle(canGo, false)}
            >
              Scouting Report
            </button>
            <button
              disabled={!canGo}
              onClick={() => navigate(`/simulate/${pitcher.id}/${batter.id}`)}
              style={btnStyle(canGo, true)}
            >
              Step-Through Simulator →
            </button>
          </div>
        </div>
      )}

      {tab === 'today' && <TodayGames />}
    </div>
  )
}

function btnStyle(enabled, primary) {
  return {
    padding: '10px 20px',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'var(--surface)',
    color: enabled ? 'var(--text)' : 'var(--text-muted)',
    fontWeight: 600,
    fontSize: 14,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
    transition: 'all .15s',
  }
}
