import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTodayGames, simulate, getPlayer, getH2H, getHitterProfile } from '../api'
import H2HPanel from '../components/H2HPanel'
import { getTeamColors, getLogoUrl } from '../teamConfig'
import PitchCard from '../components/PitchCard'
import CountSelector from '../components/CountSelector'
import WeightsPanel from '../components/WeightsPanel'
import HitterProfile from '../components/HitterProfile'

const PITCH_TYPE_LABELS = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',ST:'Sweeper',
  CU:'Curveball',KC:'Knuckle Curve',CH:'Changeup',FS:'Splitter',
}

const RESULTS = [
  { key: 'ball',            label: 'Ball',         db: 0, sb: 0 },
  { key: 'called_strike',   label: 'Called Strike',db: 0, sb: 1 },
  { key: 'swinging_strike', label: 'Swing & Miss', db: 0, sb: 1 },
  { key: 'foul',            label: 'Foul',         db: 0, sb: 1, noThird: true },
  { key: 'hit_into_play',   label: 'In Play',      db: 0, sb: 0, endsAB: true },
  { key: 'strikeout',       label: 'Strikeout',    db: 0, sb: 0, endsAB: true },
  { key: 'walk',            label: 'Walk',         db: 0, sb: 0, endsAB: true },
]

function advanceCount(balls, strikes, resultKey) {
  const r = RESULTS.find(r => r.key === resultKey)
  if (!r) return { balls, strikes, ended: false }
  if (r.endsAB) return { balls: 0, strikes: 0, ended: true }
  if (resultKey === 'ball') {
    if (balls === 3) return { balls: 0, strikes: 0, ended: true }
    return { balls: balls + 1, strikes, ended: false }
  }
  if (resultKey === 'foul' && strikes === 2) return { balls, strikes, ended: false }
  if (strikes === 2) return { balls: 0, strikes: 0, ended: true }
  return { balls, strikes: strikes + 1, ended: false }
}

export default function GamePreviewPage() {
  const { gamePk, side } = useParams()
  const [gameData, setGameData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [batterIdx, setBatterIdx] = useState(0)

  useEffect(() => {
    getTodayGames().then(data => {
      const game = data.games.find(g => String(g.game_pk) === String(gamePk))
      setGameData(game || null)
    }).finally(() => setLoading(false))
  }, [gamePk])

  if (loading) return <div style={{ padding: 48, color: 'var(--text-muted)' }}>Loading game…</div>
  if (!gameData) return <div style={{ padding: 48, color: 'var(--red)' }}>Game not found.</div>

  const pitcherSide = side === 'away' ? gameData.away : gameData.home
  const batterSide  = side === 'away' ? gameData.home : gameData.away
  const pitcher     = pitcherSide.probable_pitcher
  const lineup      = batterSide.lineup || []
  const batter      = lineup[batterIdx] || null
  const lineupConfirmed = batterSide.lineup_confirmed

  const pitcherColors = getTeamColors(pitcherSide.team_id)
  const batterColors  = getTeamColors(batterSide.team_id)
  const pitcherLogo   = getLogoUrl(pitcherSide.team_id)
  const batterLogo    = getLogoUrl(batterSide.team_id)

  if (!pitcher?.id) {
    return <div style={{ padding: 48, color: 'var(--text-muted)' }}>No probable pitcher listed yet for this game.</div>
  }

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
          <Link to="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', position: 'absolute', top: -38 }}>← Today's Games</Link>

          {/* Pitcher */}
          <GamePlayerHeader id={pitcher.id} name={pitcher.name} teamAbbr={pitcherSide.team_abbr} logo={pitcherLogo} sub="Pitcher" />

          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', margin: '0 8px' }}>vs</div>

          {/* Batter */}
          <GamePlayerHeader
            id={batter?.id} name={batter?.name || 'Select a batter'}
            teamAbbr={batterSide.team_abbr} logo={batterLogo}
            sub={batter ? `#${batter.batting_order} in lineup${!lineupConfirmed ? ' · Projected' : ''}` : null}
          />
        </div>

        {/* Lineup arrows */}
        {lineup.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => setBatterIdx(i => Math.max(0, i - 1))}
              disabled={batterIdx === 0}
              style={arrowBtn(batterIdx === 0)}
            >← Prev</button>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{batterIdx + 1} / {lineup.length}</div>
              <div>in lineup</div>
            </div>
            <button
              onClick={() => setBatterIdx(i => Math.min(lineup.length - 1, i + 1))}
              disabled={batterIdx === lineup.length - 1}
              style={arrowBtn(batterIdx === lineup.length - 1)}
            >Next →</button>
          </div>
        )}
      </div>

      {/* Main layout: lineup sidebar + simulator */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Lineup sidebar */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
              {batterSide.team_abbr} Lineup
            </span>
            {!lineupConfirmed && (
              <span style={{ fontSize: 9, fontWeight: 600, color: '#f59e0b', background: '#451a03', padding: '2px 6px', borderRadius: 4 }}>
                PROJECTED
              </span>
            )}
          </div>
          {lineup.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Lineup not available</div>
          ) : (
            lineup.map((player, idx) => (
              <div
                key={player.id || idx}
                onClick={() => setBatterIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: batterIdx === idx ? 'rgba(59,130,246,0.15)' : 'none',
                  borderLeft: batterIdx === idx ? '3px solid #3b82f6' : '3px solid transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (batterIdx !== idx) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (batterIdx !== idx) e.currentTarget.style.background = 'none' }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 16, textAlign: 'right', fontFamily: 'monospace' }}>
                  {player.batting_order}
                </span>
                <span style={{ fontSize: 13, fontWeight: batterIdx === idx ? 700 : 400, color: batterIdx === idx ? 'var(--accent2)' : 'var(--text)' }}>
                  {player.name}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Simulator panel */}
        {batter?.id && pitcher?.id ? (
          <SimulatorCore
            key={`${pitcher.id}-${batter.id}`}
            pitcherId={pitcher.id}
            batterId={batter.id}
            batterName={batter.name}
          />
        ) : (
          <div style={{ padding: 32, color: 'var(--text-muted)' }}>Select a batter from the lineup.</div>
        )}
      </div>
    </div>
  )
}

function SimulatorCore({ pitcherId, batterId, batterName }) {
  const [pitcher, setPitcher] = useState(null)
  const [batter, setBatter]   = useState(null)
  const [balls, setBalls]     = useState(0)
  const [strikes, setStrikes] = useState(0)
  const [stand, setStand]     = useState('R')
  const [prevPitch, setPrevPitch] = useState(null)
  const [atBatHistory, setAtBatHistory] = useState([])
  const [recs, setRecs]       = useState([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [logMode, setLogMode] = useState(false)
  const [logPitch, setLogPitch] = useState(null)
  const [logZone, setLogZone]   = useState(null)
  const [logResult, setLogResult] = useState(null)
  const [abEnded, setAbEnded] = useState(false)
  const [h2h, setH2h]                 = useState(null)
  const [showH2H, setShowH2H]         = useState(false)
  const [situationGoal, setSituationGoal] = useState(null)
  const [vulnerability, setVulnerability] = useState({})

  useEffect(() => {
    getPlayer(pitcherId).then(setPitcher).catch(() => {})
    getPlayer(batterId).then(p => {
      setBatter(p)
      if (p?.bats) setStand(p.bats === 'L' ? 'L' : 'R')
    }).catch(() => {})
    getH2H(pitcherId, batterId).then(setH2h).catch(() => {})
    getHitterProfile(batterId).then(profile => {
      const vuln = {}
      for (const v of (profile?.pitch_vulnerability || [])) vuln[v.pitch_type] = v
      setVulnerability(vuln)
    }).catch(() => {})
    setH2h(null); setShowH2H(false)
    setBalls(0); setStrikes(0); setPrevPitch(null); setAtBatHistory([]); setAbEnded(false)
  }, [pitcherId, batterId])

  const fetchRecs = useCallback(async (b, s, pp) => {
    setLoading(true); setError(null)
    try {
      const data = await simulate({ pitcher_id: pitcherId, batter_id: batterId, balls: b, strikes: s, stand, prev_pitch_type: pp || null })
      setRecs(data); setSelected(0)
    } catch (e) {
      setError(e.message); setRecs([])
    } finally {
      setLoading(false)
    }
  }, [pitcherId, batterId, stand])

  useEffect(() => { fetchRecs(balls, strikes, prevPitch) }, [balls, strikes, prevPitch, stand])

  function confirmLog() {
    if (!logPitch || !logResult) return
    const resultLabel = RESULTS.find(r => r.key === logResult)?.label || logResult
    const entry = { pitch_type: logPitch, zone: logZone, zone_label: logZone ? `Zone ${logZone}` : '—', result: logResult, result_label: resultLabel }
    setAtBatHistory(h => [...h, entry])
    setPrevPitch(logPitch)
    const { balls: nb, strikes: ns, ended } = advanceCount(balls, strikes, logResult)
    setAbEnded(ended)
    if (!ended) { setBalls(nb); setStrikes(ns) }
    setLogPitch(null); setLogZone(null); setLogResult(null); setLogMode(false)
  }

  function resetAtBat() {
    setAtBatHistory([]); setPrevPitch(null)
    setBalls(0); setStrikes(0); setAbEnded(false)
    setLogPitch(null); setLogZone(null); setLogResult(null); setLogMode(false)
  }

  const adjustedRecs = situationGoal
    ? [...recs].sort((a, b) => goalScore(b, situationGoal, vulnerability) - goalScore(a, situationGoal, vulnerability))
    : recs

  const activeRec = adjustedRecs[selected] || null

  return (
    <div>
      {/* Stand selector + H2H */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: showH2H ? 12 : 20 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Batter stands:</span>
        {['R','L'].map(s => (
          <button key={s} onClick={() => setStand(s)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700,
            background: stand === s ? 'var(--accent)' : 'var(--surface2)',
            border: `1px solid ${stand === s ? 'var(--accent)' : 'var(--border)'}`,
            color: stand === s ? '#fff' : 'var(--text)', cursor: 'pointer',
          }}>{s}HH</button>
        ))}
        <button onClick={() => setShowH2H(v => !v)} style={{
          padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          background: showH2H ? 'var(--accent)' : 'var(--surface2)',
          border: `1px solid ${showH2H ? 'var(--accent)' : 'var(--border)'}`,
          color: showH2H ? '#fff' : 'var(--text)', cursor: 'pointer',
        }}>
          H2H History {h2h ? `(${h2h.at_bats.length})` : ''}
        </button>
      </div>

      {showH2H && <H2HPanel atBats={h2h?.at_bats} pitcher={pitcher} batter={batter} compact />}

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 260px', gap: 20, alignItems: 'start' }}>

        {/* Left col: count + log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CountSelector balls={balls} strikes={strikes} onChange={(b,s) => { setBalls(b); setStrikes(s) }} />

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>At-Bat Log</span>
              {atBatHistory.length > 0 && <button onClick={resetAtBat} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Reset</button>}
            </div>
            {abEnded && (
              <div style={{ padding: '6px 10px', background: '#14532d', borderRadius: 6, fontSize: 12, color: '#4ade80', marginBottom: 10, fontWeight: 600 }}>
                At-bat over · <button onClick={resetAtBat} style={{ color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Start new →</button>
              </div>
            )}
            {atBatHistory.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No pitches logged yet.</p>
              : atBatHistory.map((p, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', marginRight: 6 }}>{i+1}.</span>
                  <span style={{ fontWeight: 600 }}>{PITCH_TYPE_LABELS[p.pitch_type] || p.pitch_type}</span>
                  <span style={{ color: 'var(--text-muted)' }}> · {p.zone_label} · </span>
                  <span style={{ color: resultColor(p.result) }}>{p.result_label}</span>
                </div>
              ))
            }
            {prevPitch && !abEnded && (
              <div style={{ marginTop: 10, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                Prev: <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>{PITCH_TYPE_LABELS[prevPitch] || prevPitch}</span>
                <button onClick={() => setPrevPitch(null)} style={{ marginLeft: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          {activeRec && <WeightsPanel weights={activeRec.weights_used} countCategory={activeRec.count_category} />}
        </div>

        {/* Center: recs + log panel */}
        <div>
          {/* Situation goal selector */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Situation Goal</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {SITUATION_GOALS.map(g => (
                <button key={g.key} onClick={() => setSituationGoal(situationGoal === g.key ? null : g.key)} style={{
                  padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: situationGoal === g.key ? g.color : 'var(--surface2)',
                  border: `1px solid ${situationGoal === g.key ? g.color : 'var(--border)'}`,
                  color: situationGoal === g.key ? '#fff' : 'var(--text)',
                }}>{g.label}</button>
              ))}
            </div>
            {situationGoal && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {SITUATION_GOALS.find(g => g.key === situationGoal)?.description}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              Recommendations <span style={{ fontFamily: 'monospace', color: 'var(--accent2)' }}>{balls}-{strikes}</span>
            </h2>
            {loading && <Spinner />}
            {!abEnded && (
              <button onClick={() => setLogMode(m => !m)} style={{
                marginLeft: 'auto', padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: logMode ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${logMode ? 'var(--accent)' : 'var(--border)'}`,
                color: logMode ? '#fff' : 'var(--text)', cursor: 'pointer',
              }}>
                {logMode ? '✕ Cancel' : '+ Log Pitch'}
              </button>
            )}
          </div>

          {logMode && !abEnded && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent2)', marginBottom: 12 }}>What was actually thrown?</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Pitch type</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(PITCH_TYPE_LABELS).map(([pt, label]) => (
                    <button key={pt} onClick={() => setLogPitch(pt)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: logPitch === pt ? 'var(--accent)' : 'var(--surface)',
                      border: `1px solid ${logPitch === pt ? 'var(--accent)' : 'var(--border)'}`,
                      color: logPitch === pt ? '#fff' : 'var(--text)', cursor: 'pointer',
                    }}>{pt}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Result</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {RESULTS.map(r => (
                    <button key={r.key} onClick={() => setLogResult(r.key)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: logResult === r.key ? resultBg(r.key) : 'var(--surface)',
                      border: `1px solid ${logResult === r.key ? resultColor(r.key) : 'var(--border)'}`,
                      color: logResult === r.key ? '#fff' : 'var(--text)', cursor: 'pointer',
                    }}>{r.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                Click a zone on the heat map to record location →
                {logZone && <span style={{ color: 'var(--accent2)', marginLeft: 6 }}>Zone {logZone} selected</span>}
              </div>
              <button onClick={confirmLog} disabled={!logPitch || !logResult} style={{
                padding: '8px 20px', background: logPitch && logResult ? 'var(--accent)' : 'var(--surface2)',
                border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13,
                cursor: logPitch && logResult ? 'pointer' : 'not-allowed', opacity: logPitch && logResult ? 1 : 0.5,
              }}>Confirm & Advance Count</button>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, color: '#fca5a5', marginBottom: 16, fontSize: 13 }}>
              No data for this matchup/count — try adjusting.
            </div>
          )}

          {adjustedRecs.map((rec, i) => (
            <PitchCard
              key={rec.pitch_type} rec={rec} rank={i}
              selected={selected === i} onClick={() => setSelected(i)}
              situationGoal={situationGoal}
              situationBest={i === 0 && situationGoal != null}
              vulnerability={vulnerability[rec.pitch_type]}
            />
          ))}
        </div>

        {/* Right: zone heatmap */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              {logMode ? '← Click zone to log' : `Zone Heat Map · ${activeRec?.pitch_label || '—'}`}
            </div>
            <ZoneMap
              zones={logMode ? [] : (activeRec?.zones || [])}
              logMode={logMode}
              selectedZone={logZone}
              onZoneClick={setLogZone}
              width={228}
            />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>Worse</span>
              <div style={{ flex:1, height:4, borderRadius:2, background:'linear-gradient(to right,#1d4ed8,#93c5fd,#f8fafc,#fca5a5,#dc2626)' }} />
              <span>Better</span>
            </div>
          </div>

          {activeRec && activeRec.zones.length > 0 && !logMode && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Zone Breakdown</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th style={th}>Zone</th><th style={th}>Whiff</th><th style={th}>RV</th><th style={th}>n</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRec.zones.slice(0, 6).map(z => (
                    <tr key={z.zone} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>{z.zone_label}</td>
                      <td style={{ ...td, color: 'var(--green)', fontFamily: 'monospace' }}>{z.whiff_rate != null ? pct(z.whiff_rate) : '—'}</td>
                      <td style={{ ...td, color: z.avg_run_value < 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'monospace' }}>{z.avg_run_value?.toFixed(3) ?? '—'}</td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{z.pitch_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <HitterProfile batterId={batterId} batterName={batterName} />
    </div>
  )
}

const ZONE_GRID = {
  1:[1,1],2:[2,1],3:[3,1],4:[1,2],5:[2,2],6:[3,2],
  7:[1,3],8:[2,3],9:[3,3],11:[0,1],12:[4,1],13:[2,0],14:[2,4],
}

function ZoneMap({ zones, logMode, selectedZone, onZoneClick, width }) {
  const W = width, cellW = W/5, cellH = W/5
  const scoreByZone = {}
  if (zones.length) {
    const scores = zones.map(z => z.score)
    const [mn, mx] = [Math.min(...scores), Math.max(...scores)]
    zones.forEach(z => {
      const t = mn === mx ? 0.5 : (z.score - mn) / (mx - mn)
      scoreByZone[z.zone] = interpolateStops(['#1d4ed8','#93c5fd','#f8fafc','#fca5a5','#dc2626'], t)
    })
  }

  return (
    <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} style={{ display: 'block', cursor: logMode ? 'pointer' : 'default' }}>
      {Object.entries(ZONE_GRID).map(([zid, [col, row]]) => {
        const z = parseInt(zid)
        const x = col*cellW, y = row*cellH
        const inZone = z <= 9
        const shrink = inZone ? 0 : 3
        const isSelected = selectedZone === z
        const fill = logMode
          ? (isSelected ? '#3b82f6' : (inZone ? '#1e2d45' : '#111827'))
          : (scoreByZone[z] || (inZone ? '#1e2d45' : '#111827'))
        return (
          <g key={z} onClick={() => logMode && onZoneClick(z)}>
            <rect x={x+shrink} y={y+shrink} width={cellW-shrink*2} height={cellH-shrink*2}
              rx={inZone?3:5} fill={fill}
              stroke={isSelected ? '#fbbf24' : (inZone ? '#2d4060' : '#1a2a3a')}
              strokeWidth={isSelected ? 2.5 : 0.5} opacity={inZone?1:0.75} />
            {inZone && (
              <text x={x+cellW/2} y={y+cellH/2} textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? '#fff' : (scoreByZone[z] ? (isLight(scoreByZone[z]) ? '#0f172a' : '#f8fafc') : '#334155')}
                fontSize={10} fontWeight={500}>{z}</text>
            )}
          </g>
        )
      })}
      <rect x={cellW} y={cellH} width={cellW*3} height={cellH*3}
        fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="3 2" rx={2} />
    </svg>
  )
}

function interpolateStops(stops, t) {
  const n = stops.length - 1
  const i = Math.min(Math.floor(t * n), n - 1)
  const f = t * n - i
  return lerpHex(stops[i], stops[i+1], f)
}

function lerpHex(a, b, t) {
  const r1=parseInt(a.slice(1,3),16),g1=parseInt(a.slice(3,5),16),b1=parseInt(a.slice(5,7),16)
  const r2=parseInt(b.slice(1,3),16),g2=parseInt(b.slice(3,5),16),b2=parseInt(b.slice(5,7),16)
  return `#${Math.round(r1+(r2-r1)*t).toString(16).padStart(2,'0')}${Math.round(g1+(g2-g1)*t).toString(16).padStart(2,'0')}${Math.round(b1+(b2-b1)*t).toString(16).padStart(2,'0')}`
}

function isLight(hex) {
  if (!hex?.startsWith('#')) return false
  return (parseInt(hex.slice(1,3),16)*299+parseInt(hex.slice(3,5),16)*587+parseInt(hex.slice(5,7),16)*114)/1000>128
}

function resultColor(key) {
  if (key==='ball'||key==='walk') return 'var(--yellow)'
  if (key==='hit_into_play') return 'var(--red)'
  if (['strikeout','swinging_strike','called_strike'].includes(key)) return 'var(--green)'
  return 'var(--text-muted)'
}

function resultBg(key) {
  if (key==='ball'||key==='walk') return '#92400e'
  if (key==='hit_into_play') return '#7f1d1d'
  if (['strikeout','swinging_strike','called_strike'].includes(key)) return '#14532d'
  return 'var(--surface2)'
}


function arrowBtn(disabled) {
  return {
    padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: disabled ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    backdropFilter: 'blur(4px)',
  }
}

function GamePlayerHeader({ id, name, teamAbbr, logo, sub }) {
  const headshotUrl = id
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {headshotUrl && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={headshotUrl} alt={name}
            style={{
              width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center',
              border: '2px solid rgba(255,255,255,0.3)',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
              background: 'rgba(0,0,0,0.3)',
            }}
            onError={e => { e.target.style.display = 'none' }}
          />
          {logo && (
            <img src={logo} alt={teamAbbr}
              style={{ position: 'absolute', bottom: -2, right: -4, width: 24, height: 24, objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}
              onError={e => e.target.style.display = 'none'}
            />
          )}
        </div>
      )}
      <div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em' }}>{teamAbbr}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 1px 4px rgba(0,0,0,0.5)', lineHeight: 1.2 }}>{name}</div>
        {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width:16, height:16, border:'2px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin .6s linear infinite' }} />
}

const th = { padding:'4px 6px', textAlign:'left', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'.04em' }
const td = { padding:'6px 6px' }
const pct = v => `${(v*100).toFixed(1)}%`

const SITUATION_GOALS = [
  { key: 'strikeout',   label: '🔥 Need a K',          color: '#7c3aed', description: 'Re-ranks by whiff rate + chase rate. Best pitch to hunt a strikeout.' },
  { key: 'groundball',  label: '⬇️ Need a Ground Ball', color: '#0369a1', description: 'Re-ranks by ground ball rate. Best pitch to induce a double play.' },
  { key: 'weakcontact', label: '🪶 Need Weak Contact',  color: '#047857', description: 'Re-ranks by xwOBA suppression. Best pitch to get a weak fly ball or soft out.' },
  { key: 'chase',       label: '🪤 Expand the Zone',    color: '#b45309', description: 'Re-ranks by chase rate. Best pitch to get the batter to chase out of the zone.' },
]

function goalScore(rec, goal, vulnerability) {
  const whiff  = rec.whiff_rate  ?? 0
  const chase  = rec.chase_rate  ?? 0
  const xwoba  = rec.avg_xwoba   ?? 0.320
  const vuln   = vulnerability?.[rec.pitch_type]
  const gbPct  = vuln?.gb_pct    ?? 0
  switch (goal) {
    case 'strikeout':   return whiff * 0.65 + chase * 0.35
    case 'groundball':  return gbPct * 0.80 + (0.500 - xwoba) * 0.20
    case 'weakcontact': return (0.500 - xwoba) * 0.70 + gbPct * 0.30
    case 'chase':       return chase * 0.80 + whiff * 0.20
    default:            return rec.score
  }
}
