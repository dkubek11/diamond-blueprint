import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getMatchup, getPlayer, getPitcherArsenal } from '../api'
import { getTeamColors, getLogoUrl } from '../teamConfig'

const COUNT_CATEGORY_LABELS = {
  first_pitch:'First Pitch', early_ahead:'Early Ahead', early_behind:'Early Behind',
  even:'Even', hitters_count:"Hitter's Count", pitchers_count:"Pitcher's Count",
  two_strike:'Two-Strike', full_count:'Full Count',
}

export default function MatchupPage() {
  const { pitcherId, batterId } = useParams()
  const navigate = useNavigate()
  const [stand, setStand] = useState('R')
  const [pitcher, setPitcher] = useState(null)
  const [batter, setBatter]   = useState(null)
  const [matchup, setMatchup] = useState(null)
  const [arsenal, setArsenal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getPlayer(pitcherId),
      getPlayer(batterId),
      getMatchup(pitcherId, batterId, stand),
      getPitcherArsenal(pitcherId, stand),
    ]).then(([p, b, m, a]) => {
      setPitcher(p); setBatter(b); setMatchup(m); setArsenal(a)
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [pitcherId, batterId, stand])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading scouting report…</div>
  if (error)   return <div style={{ padding: 40, color: 'var(--red)' }}>Error: {error}</div>

  const pitcherColors = getTeamColors(pitcher?.team_id)
  const batterColors  = getTeamColors(batter?.team_id)
  const pitcherLogo   = getLogoUrl(pitcher?.team_id)
  const batterLogo    = getLogoUrl(batter?.team_id)

  return (
    <div>
      {/* Team-branded header */}
      <div style={{
        margin: '-24px -32px 28px', padding: '0 32px',
        background: `linear-gradient(135deg, ${pitcherColors.primary} 0%, ${pitcherColors.primary}cc 40%, ${batterColors.primary}cc 60%, ${batterColors.primary} 100%)`,
        borderBottom: `3px solid ${pitcherColors.secondary}`,
        minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <Link to="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', position: 'absolute', top: -38 }}>← New Search</Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pitcherLogo && <img src={pitcherLogo} alt={pitcher?.team_abbr} style={{ width: 56, height: 56, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} onError={e => e.target.style.display='none'} />}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em' }}>{pitcher?.team_abbr || 'PITCHER'}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{pitcher?.name}</div>
            </div>
          </div>

          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', margin: '0 8px' }}>vs</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {batterLogo && <img src={batterLogo} alt={batter?.team_abbr} style={{ width: 56, height: 56, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} onError={e => e.target.style.display='none'} />}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em' }}>{batter?.team_abbr || 'BATTER'}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{batter?.name}</div>
            </div>
          </div>

          <div style={{ marginLeft: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Advanced Matchup Scouting Report</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Batter stands:</span>
          {['R','L'].map(s => (
            <button key={s} onClick={() => setStand(s)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700,
              background: stand === s ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${stand === s ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'}`,
              color: '#fff', cursor: 'pointer',
            }}>{s}HH</button>
          ))}
          <button onClick={() => navigate(`/simulate/${pitcherId}/${batterId}`)} style={{
            marginLeft: 8, padding: '6px 16px',
            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
            color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>Open Simulator →</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Arsenal */}
        {arsenal && (
          <Section title={`${pitcher?.name} Arsenal vs ${stand}HH`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Pitch</th>
                  <th style={th}>Usage</th>
                  <th style={th}>Whiff%</th>
                  <th style={th}>Chase%</th>
                  <th style={th}>Run Val</th>
                </tr>
              </thead>
              <tbody>
                {arsenal.arsenal.map(p => (
                  <tr key={p.pitch_type} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><span style={{ fontWeight: 600 }}>{p.pitch_type}</span></td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{p.usage_pct}%</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: p.whiff_rate > 0.25 ? 'var(--green)' : 'var(--text)' }}>
                      {p.whiff_rate != null ? pct(p.whiff_rate) : '—'}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', color: p.chase_rate > 0.30 ? 'var(--green)' : 'var(--text)' }}>
                      {p.chase_rate != null ? pct(p.chase_rate) : '—'}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', color: p.avg_run_value < 0 ? 'var(--green)' : 'var(--red)' }}>
                      {p.avg_run_value != null ? p.avg_run_value.toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Count breakdown */}
        {matchup && (
          <Section title="Best Pitch by Count">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Count</th>
                  <th style={th}>Situation</th>
                  <th style={th}>Top Pitch</th>
                  <th style={th}>Best Zone</th>
                  <th style={th}>Whiff%</th>
                </tr>
              </thead>
              <tbody>
                {matchup.count_breakdown.map(row => (
                  <tr
                    key={row.count}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/simulate/${pitcherId}/${batterId}`)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent2)' }}>{row.count}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{COUNT_CATEGORY_LABELS[row.count_category] || row.count_category || ''}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{row.top_pitch_label}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{row.top_zone || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: row.whiff_rate > 0.25 ? 'var(--green)' : 'var(--text)' }}>
                      {row.whiff_rate != null ? pct(row.whiff_rate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              Click any count to open the step-through simulator.
            </p>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text)' }}>{title}</h2>
      {children}
    </div>
  )
}

const th = { padding: '6px 8px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }
const td = { padding: '8px 8px' }
function pct(v) { return `${(v * 100).toFixed(1)}%` }
