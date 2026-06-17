import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { simulate, getPlayer, getH2H } from '../api'
import H2HPanel from '../components/H2HPanel'
import SequenceChain from '../components/SequenceChain'
import StrikeZone from '../components/StrikeZone'
import PitchCard from '../components/PitchCard'
import CountSelector from '../components/CountSelector'
import WeightsPanel from '../components/WeightsPanel'
import HitterProfile from '../components/HitterProfile'
import { getTeamColors, getLogoUrl, hexToRgb } from '../teamConfig'

const PITCH_TYPE_LABELS = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',ST:'Sweeper',
  CU:'Curveball',KC:'Knuckle Curve',CH:'Changeup',FS:'Splitter',
}

const RESULTS = [
  { key: 'ball',            label: 'Ball',            resultKey: 'ball',        db: 0, sb: 0 },
  { key: 'called_strike',   label: 'Called Strike',   resultKey: 'called_strike', db: 0, sb: 1 },
  { key: 'swinging_strike', label: 'Swing & Miss',    resultKey: 'swing_miss',  db: 0, sb: 1 },
  { key: 'foul_weak',       label: 'Foul (Late/Weak)',resultKey: 'weak_foul',   db: 0, sb: 1, noThird: true, countKey: 'foul' },
  { key: 'foul_hard',       label: 'Foul (Hard/Roped)',resultKey: 'hard_foul',  db: 0, sb: 1, noThird: true, countKey: 'foul' },
  { key: 'hit_into_play',   label: 'In Play',         resultKey: null,          db: 0, sb: 0, endsAB: true },
  { key: 'strikeout',       label: 'Strikeout',       resultKey: null,          db: 0, sb: 0, endsAB: true },
  { key: 'walk',            label: 'Walk',            resultKey: null,          db: 0, sb: 0, endsAB: true },
]

function advanceCount(balls, strikes, resultKey) {
  const r = RESULTS.find(r => r.key === resultKey)
  if (!r) return { balls, strikes, ended: false }
  if (r.endsAB) return { balls: 0, strikes: 0, ended: true }
  const effectiveKey = r.countKey || resultKey
  if (effectiveKey === 'ball') {
    if (balls === 3) return { balls: 0, strikes: 0, ended: true }
    return { balls: balls + 1, strikes, ended: false }
  }
  const isFoulOnTwo = effectiveKey === 'foul' && strikes === 2
  if (isFoulOnTwo) return { balls, strikes, ended: false }
  if (strikes === 2) return { balls: 0, strikes: 0, ended: true }
  return { balls, strikes: strikes + 1, ended: false }
}

export default function SimulatorPage() {
  const { pitcherId, batterId } = useParams()
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

  const [h2h, setH2h]             = useState(null)
  const [showH2H, setShowH2H]     = useState(false)
  const [prevPitchResult, setPrevPitchResult] = useState(null)

  // Live logging mode
  const [logMode, setLogMode]         = useState(false)  // true = logging what actually happened
  const [logPitch, setLogPitch]       = useState(null)   // pitch type actually thrown
  const [logZone, setLogZone]         = useState(null)   // zone it went to
  const [logResult, setLogResult]     = useState(null)   // outcome
  const [abEnded, setAbEnded]         = useState(false)

  useEffect(() => {
    getPlayer(pitcherId).then(setPitcher).catch(() => {})
    getPlayer(batterId).then(p => {
      setBatter(p)
      if (p?.bats) setStand(p.bats === 'L' ? 'L' : 'R')
    }).catch(() => {})
    getH2H(pitcherId, batterId).then(setH2h).catch(() => {})
  }, [pitcherId, batterId])

  const fetchRecs = useCallback(async (b, s, pp, ppr) => {
    setLoading(true)
    setError(null)
    try {
      const data = await simulate({
        pitcher_id: parseInt(pitcherId),
        batter_id: parseInt(batterId),
        balls: b, strikes: s, stand,
        prev_pitch_type: pp || null,
        prev_pitch_result: ppr || null,
      })
      setRecs(data)
      setSelected(0)
    } catch (e) {
      setError(e.message)
      setRecs([])
    } finally {
      setLoading(false)
    }
  }, [pitcherId, batterId, stand])

  useEffect(() => { fetchRecs(balls, strikes, prevPitch, prevPitchResult) }, [balls, strikes, prevPitch, prevPitchResult, stand])

  function handleCountChange(b, s) { setBalls(b); setStrikes(s) }

  function confirmLog() {
    if (!logPitch || !logResult) return
    const resultObj = RESULTS.find(r => r.key === logResult)
    const resultLabel = resultObj?.label || logResult
    const rKey = resultObj?.resultKey || null
    const zoneLabel = logZone ? `Zone ${logZone}` : '—'
    const entry = { pitch_type: logPitch, zone: logZone, zone_label: zoneLabel, result: logResult, result_label: resultLabel }
    setAtBatHistory(h => [...h, entry])
    setPrevPitch(logPitch)
    setPrevPitchResult(rKey)

    const { balls: nb, strikes: ns, ended } = advanceCount(balls, strikes, logResult)
    setAbEnded(ended)
    if (!ended) { setBalls(nb); setStrikes(ns) }

    setLogPitch(null); setLogZone(null); setLogResult(null)
    setLogMode(false)
  }

  function resetAtBat() {
    setAtBatHistory([]); setPrevPitch(null); setPrevPitchResult(null)
    setBalls(0); setStrikes(0); setAbEnded(false)
    setLogPitch(null); setLogZone(null); setLogResult(null); setLogMode(false)
  }

  const activeRec = recs[selected] || null
  const pitcherColors = getTeamColors(pitcher?.team_id)
  const batterColors  = getTeamColors(batter?.team_id)
  const pitcherLogo   = getLogoUrl(pitcher?.team_id)
  const batterLogo    = getLogoUrl(batter?.team_id)

  return (
    <div>
      {/* Team-branded header */}
      <div style={{
        margin: '-24px -32px 28px',
        padding: '0 32px',
        background: `linear-gradient(135deg, ${pitcherColors.primary} 0%, ${pitcherColors.primary}cc 40%, ${batterColors.primary}cc 60%, ${batterColors.primary} 100%)`,
        borderBottom: `3px solid ${pitcherColors.secondary}`,
        minHeight: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle diagonal divider */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <Link to="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', position: 'absolute', top: -38 }}>← Back</Link>

          {/* Pitcher */}
          <PlayerHeader id={pitcher?.id} name={pitcher?.name} teamAbbr={pitcher?.team_abbr} logo={pitcherLogo} label="PITCHER" />

          <div style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: '0 8px' }}>vs</div>

          {/* Batter */}
          <PlayerHeader id={batter?.id} name={batter?.name} teamAbbr={batter?.team_abbr} logo={batterLogo} label="BATTER" />
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Batter stands:</span>
            {['R','L'].map(s => (
              <button key={s} onClick={() => setStand(s)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                background: stand === s ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
                border: `1px solid ${stand === s ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'}`,
                color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)',
              }}>{s}HH</button>
            ))}
            <button onClick={() => setShowH2H(v => !v)} style={{
              padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: showH2H ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${showH2H ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'}`,
              color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)',
            }}>
              H2H History {h2h ? `(${h2h.at_bats.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {showH2H && (
        <H2HPanel atBats={h2h?.at_bats} pitcher={pitcher} batter={batter} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 24, alignItems: 'start' }}>

        {/* Left — count + log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CountSelector balls={balls} strikes={strikes} onChange={handleCountChange} />

          {/* At-bat log */}
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

            {atBatHistory.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No pitches logged yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {atBatHistory.map((p, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', marginRight: 6 }}>{i+1}.</span>
                    <span style={{ fontWeight: 600 }}>{PITCH_TYPE_LABELS[p.pitch_type] || p.pitch_type}</span>
                    <span style={{ color: 'var(--text-muted)' }}> · {p.zone_label} · </span>
                    <span style={{ color: resultColor(p.result) }}>{p.result_label}</span>
                  </div>
                ))}
              </div>
            )}

            {prevPitch && !abEnded && (
              <div style={{ marginTop: 10, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                Prev: <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>{PITCH_TYPE_LABELS[prevPitch] || prevPitch}</span>
                <button onClick={() => setPrevPitch(null)} style={{ marginLeft: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          {activeRec && <WeightsPanel weights={activeRec.weights_used} countCategory={activeRec.count_category} />}
        </div>

        {/* Center — recommendations + live log panel */}
        <div>
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
                {logMode ? '✕ Cancel Log' : '+ Log Pitch Thrown'}
              </button>
            )}
          </div>

          {/* Live log panel */}
          {logMode && !abEnded && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent2)', marginBottom: 12 }}>What was actually thrown?</div>

              {/* Pitch type */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Pitch thrown</div>
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

              {/* Result */}
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
                Optionally click a zone on the heat map to record location →
                {logZone && <span style={{ color: 'var(--accent2)', marginLeft: 6 }}>Zone {logZone} selected</span>}
              </div>

              <button
                onClick={confirmLog}
                disabled={!logPitch || !logResult}
                style={{
                  padding: '8px 20px', background: logPitch && logResult ? 'var(--accent)' : 'var(--surface2)',
                  border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600,
                  fontSize: 13, cursor: logPitch && logResult ? 'pointer' : 'not-allowed',
                  opacity: logPitch && logResult ? 1 : 0.5,
                }}
              >
                Confirm & Advance Count
              </button>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, color: '#fca5a5', marginBottom: 16, fontSize: 13 }}>
              {error === '404 Not Found' ? 'No data for this count — showing closest available.' : error}
            </div>
          )}

          {recs.map((rec, i) => (
            <PitchCard key={rec.pitch_type} rec={rec} rank={i} selected={selected === i} onClick={() => setSelected(i)} />
          ))}

          <SequenceChain
            pitcherId={pitcherId}
            batterId={batterId}
            balls={balls}
            strikes={strikes}
            stand={stand}
            currentPitch={prevPitch}
          />
        </div>

        {/* Right — strike zone (clickable in log mode) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              {logMode ? '← Click zone to record location' : `Zone Heat Map · ${activeRec?.pitch_label || 'Select a pitch'}`}
            </div>
            <ClickableStrikeZone
              zones={logMode ? [] : (activeRec?.zones || [])}
              activePitch={logMode ? null : activeRec}
              stand={stand}
              width={248}
              logMode={logMode}
              selectedZone={logZone}
              onZoneClick={setLogZone}
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

      {/* Hitter profile section */}
      <HitterProfile batterId={batterId} batterName={batter?.name} />
    </div>
  )
}

// Strike zone that supports click-to-select-zone in log mode
function ClickableStrikeZone({ zones, activePitch, stand, width, logMode, selectedZone, onZoneClick }) {
  const ZONE_GRID = {
    1:[1,1],2:[2,1],3:[3,1],4:[1,2],5:[2,2],6:[3,2],
    7:[1,3],8:[2,3],9:[3,3],11:[0,1],12:[4,1],13:[2,0],14:[2,4],
  }
  const ZONE_LABELS = {
    1:'Up-In',2:'Up-Mid',3:'Up-Away',4:'Mid-In',5:'Heart',6:'Mid-Away',
    7:'Down-In',8:'Down-Mid',9:'Down-Away',11:'Chase-In',12:'Chase-Away',13:'Chase-Up',14:'Chase-Down',
  }

  const W = width, cellW = W/5, cellH = W/5

  const scoreByZone = {}
  if (zones.length) {
    const scores = zones.map(z => z.score)
    const [mn, mx] = [Math.min(...scores), Math.max(...scores)]
    const lerp = (v) => mn === mx ? 0.5 : (v - mn) / (mx - mn)
    const colorStops = ['#1d4ed8','#93c5fd','#f8fafc','#fca5a5','#dc2626']
    zones.forEach(z => {
      const t = lerp(z.score)
      scoreByZone[z.zone] = { score: z.score, color: interpolateStops(colorStops, t), data: z }
    })
  }

  return (
    <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} style={{ display: 'block', cursor: logMode ? 'pointer' : 'default' }}>
      {Object.entries(ZONE_GRID).map(([zid, [col, row]]) => {
        const z = parseInt(zid)
        const x = col*cellW, y = row*cellH
        const inZone = z <= 9
        const shrink = inZone ? 0 : 3
        const cell = scoreByZone[z]
        const isSelected = selectedZone === z
        const fill = logMode ? (isSelected ? '#3b82f6' : (inZone ? '#1e2d45' : '#111827')) : (cell?.color || (inZone ? '#1e2d45' : '#111827'))

        return (
          <g key={z} onClick={() => logMode && onZoneClick(z)} style={{ cursor: logMode ? 'pointer' : 'default' }}>
            <rect x={x+shrink} y={y+shrink} width={cellW-shrink*2} height={cellH-shrink*2}
              rx={inZone?3:5} fill={fill}
              stroke={isSelected ? '#fbbf24' : (inZone ? '#2d4060' : '#1a2a3a')}
              strokeWidth={isSelected ? 2.5 : 0.5} opacity={inZone?1:0.75}
            />
            {inZone && (
              <text x={x+cellW/2} y={y+cellH/2} textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? '#fff' : (cell ? (isLight(cell.color)?'#0f172a':'#f8fafc') : '#334155')}
                fontSize={10} fontWeight={500}>
                {z}
              </text>
            )}
            {logMode && (
              <text x={x+cellW/2} y={y+cellH/2+(inZone?8:4)} textAnchor="middle" dominantBaseline="middle"
                fill={isSelected?'#fff':'#475569'} fontSize={8}>
                {ZONE_LABELS[z]?.split('-')[1] || ''}
              </text>
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
  const r=Math.round(r1+(r2-r1)*t),g=Math.round(g1+(g2-g1)*t),bv=Math.round(b1+(b2-b1)*t)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bv.toString(16).padStart(2,'0')}`
}

function isLight(hex) {
  if (!hex?.startsWith('#')) return false
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16)
  return (r*299+g*587+b*114)/1000>128
}

function resultColor(key) {
  if (key === 'ball' || key === 'walk') return 'var(--yellow)'
  if (key === 'hit_into_play') return 'var(--red)'
  if (key === 'foul_hard') return '#f97316'
  if (key === 'strikeout' || key === 'swinging_strike' || key === 'called_strike' || key === 'foul_weak') return 'var(--green)'
  return 'var(--text-muted)'
}

function resultBg(key) {
  if (key === 'ball' || key === 'walk') return '#92400e'
  if (key === 'hit_into_play') return '#7f1d1d'
  if (key === 'foul_hard') return '#7c2d12'
  if (key === 'strikeout' || key === 'swinging_strike' || key === 'called_strike' || key === 'foul_weak') return '#14532d'
  return 'var(--surface2)'
}

function getHeadshotUrl(mlbId) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbId}/headshot/67/current`
}

function PlayerHeader({ id, name, teamAbbr, logo, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Headshot */}
      {id && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={getHeadshotUrl(id)}
            alt={name}
            style={{
              width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
              objectPosition: 'center',
              border: '2px solid rgba(255,255,255,0.3)',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
              background: 'rgba(0,0,0,0.3)',
            }}
            onError={e => { e.target.style.display = 'none' }}
          />
          {/* Team logo badge */}
          {logo && (
            <img
              src={logo}
              alt={teamAbbr}
              style={{
                position: 'absolute', bottom: -2, right: -4,
                width: 26, height: 26, objectFit: 'contain',
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))',
              }}
              onError={e => e.target.style.display = 'none'}
            />
          )}
        </div>
      )}
      <div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em' }}>
          {teamAbbr || label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 1px 4px rgba(0,0,0,0.5)', lineHeight: 1.2 }}>
          {name || '…'}
        </div>
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
