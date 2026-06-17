import { useState } from 'react'

const OUTCOME_COLOR = {
  '1B': '#22c55e', '2B': '#16a34a', '3B': '#15803d', 'HR': '#4ade80',
  'K':  '#f87171', 'BB': '#facc15', 'IBB': '#facc15', 'HBP': '#facc15',
  'Out': '#94a3b8', 'GDP': '#ef4444', 'FC': '#94a3b8',
  'E':  '#fb923c', 'SF': '#94a3b8', 'SH': '#94a3b8',
}

const DESC_COLOR = {
  'Called Strike':  { bg: '#14532d', color: '#4ade80' },
  'Swing & Miss':   { bg: '#14532d', color: '#4ade80' },
  'Foul Tip':       { bg: '#14532d', color: '#4ade80' },
  'Foul':           { bg: '#1e293b', color: '#94a3b8' },
  'Ball':           { bg: '#451a03', color: '#fbbf24' },
  'In Play':        { bg: '#1e3a5f', color: '#93c5fd' },
}

const isHit  = o => ['1B','2B','3B','HR'].includes(o)
const isGood = o => ['K'].includes(o)

export default function H2HPanel({ atBats, pitcher, batter, compact = false }) {
  const [expanded, setExpanded] = useState(null)
  const [seasonFilter, setSeasonFilter] = useState('all')

  if (!atBats?.length) return (
    <div style={panelStyle(compact)}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        No at-bats found between these two players in our database.
      </div>
    </div>
  )

  const seasons = ['all', ...Array.from(new Set(atBats.map(ab => ab.season))).sort().reverse()]
  const filtered = seasonFilter === 'all' ? atBats : atBats.filter(ab => ab.season === seasonFilter)

  const hits = filtered.filter(ab => isHit(ab.outcome)).length
  const ks   = filtered.filter(ab => ab.outcome === 'K').length
  const bbs  = filtered.filter(ab => ['BB','IBB','HBP'].includes(ab.outcome)).length
  const pas  = filtered.length
  const abs  = filtered.filter(ab => !['BB','IBB','HBP'].includes(ab.outcome)).length
  const avg  = abs > 0 ? (hits / abs).toFixed(3).replace(/^0/, '') : '---'

  return (
    <div style={panelStyle(compact)}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>
          {batter?.name} vs {pitcher?.name} · All-Time
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Season filter */}
          {seasons.map(s => (
            <button key={s} onClick={() => { setSeasonFilter(s); setExpanded(null) }} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: seasonFilter === s ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${seasonFilter === s ? 'var(--accent)' : 'var(--border)'}`,
              color: seasonFilter === s ? '#fff' : 'var(--text-muted)',
            }}>{s === 'all' ? 'All' : s}</button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14, fontSize: 13 }}>
        <Stat label="AVG" value={avg} accent />
        <Stat label="PA"  value={pas} />
        <Stat label="H"   value={hits} />
        <Stat label="K"   value={ks} />
        <Stat label="BB"  value={bbs} />
        <Stat label="HR"  value={filtered.filter(ab => ab.outcome === 'HR').length} />
      </div>

      {/* At-bat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((ab, i) => {
          const isOpen = expanded === i
          return (
            <div key={i}>
              {/* Summary row */}
              <div
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 44px 32px auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: isOpen ? '8px 8px 0 0' : 8,
                  cursor: 'pointer',
                  background: isOpen
                    ? 'var(--surface2)'
                    : isHit(ab.outcome)
                      ? 'rgba(34,197,94,0.06)'
                      : 'var(--surface2)',
                  border: `1px solid ${isOpen ? 'var(--accent)' : isHit(ab.outcome) ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                  borderBottom: isOpen ? 'none' : undefined,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.borderColor = isHit(ab.outcome) ? 'rgba(34,197,94,0.2)' : 'var(--border)' }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ab.date}</span>
                <span style={{
                  fontSize: 13, fontWeight: 800, textAlign: 'center',
                  color: OUTCOME_COLOR[ab.outcome] || 'var(--text)',
                }}>{ab.outcome}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{ab.pitch_count}p</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ab.sequence.map((p, j) => (
                    <PitchChip key={j} pitch={p} mini />
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Expanded pitch-by-pitch */}
              {isOpen && (
                <div style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--accent)',
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  {/* Pitch-by-pitch table */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 60px 1fr 68px 100px', gap: 8, padding: '0 4px', marginBottom: 4 }}>
                      {['#','Count','Pitch','Velo','Result'].map(h => (
                        <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
                      ))}
                    </div>
                    {ab.sequence.map((p, j) => {
                      const isFinal = j === ab.sequence.length - 1
                      const dc = DESC_COLOR[p.description] || { bg: 'var(--surface)', color: 'var(--text-muted)' }
                      return (
                        <div key={j} style={{
                          display: 'grid', gridTemplateColumns: '24px 60px 1fr 68px 100px',
                          alignItems: 'center', gap: 8, padding: '5px 4px',
                          borderRadius: 6,
                          background: isFinal ? 'rgba(255,255,255,0.04)' : 'none',
                          borderLeft: isFinal ? `3px solid ${OUTCOME_COLOR[ab.outcome] || '#94a3b8'}` : '3px solid transparent',
                        }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', textAlign: 'right' }}>{j + 1}</span>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.balls}-{p.strikes}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PitchChip pitch={p} />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            {p.velo ? `${p.velo}` : '—'}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: dc.bg, color: dc.color, whiteSpace: 'nowrap',
                          }}>
                            {isFinal && ab.outcome !== 'In Play' ? ab.outcome : p.description}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Mini K-zone */}
                  <MiniKZone pitches={ab.sequence} />
                </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PitchChip({ pitch, mini }) {
  const COLORS = {
    FF: '#ef4444', SI: '#f97316', FC: '#eab308',
    SL: '#3b82f6', ST: '#6366f1', CU: '#8b5cf6',
    KC: '#a855f7', CH: '#22c55e', FS: '#14b8a6',
  }
  const bg = COLORS[pitch.pitch_type] || '#64748b'
  return (
    <span title={pitch.pitch_label} style={{
      fontSize: mini ? 9 : 10, fontWeight: 700, padding: mini ? '1px 4px' : '2px 7px',
      borderRadius: 4, background: bg + '33', border: `1px solid ${bg}66`,
      color: bg, fontFamily: 'monospace', whiteSpace: 'nowrap',
    }}>
      {pitch.pitch_type || '?'}
    </span>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: accent ? 'var(--accent2)' : 'var(--text)' }}>{value}</span>
      {' '}
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
    </div>
  )
}

function MiniKZone({ pitches }) {
  const W = 130, H = 140
  // Strike zone in "plate" coordinates: x ±0.83 ft, z 1.5–3.5 ft
  const SZ = { xMin: -0.83, xMax: 0.83, zMin: 1.5, zMax: 3.5 }
  // Add padding around the zone in the SVG
  const PAD = 18
  const toSvgX = x => PAD + ((x - (SZ.xMin - 0.5)) / ((SZ.xMax + 0.5) - (SZ.xMin - 0.5))) * (W - PAD * 2)
  const toSvgY = z => PAD + (1 - (z - (SZ.zMin - 0.5)) / ((SZ.zMax + 0.5) - (SZ.zMin - 0.5))) * (H - PAD * 2)

  // Strike zone box in SVG coords
  const szX  = toSvgX(SZ.xMin), szY  = toSvgY(SZ.zMax)
  const szW  = toSvgX(SZ.xMax) - szX
  const szH2 = toSvgY(SZ.zMin) - szY

  const PITCH_COLORS = {
    FF: '#ef4444', SI: '#f97316', FC: '#eab308',
    SL: '#3b82f6', ST: '#6366f1', CU: '#8b5cf6',
    KC: '#a855f7', CH: '#22c55e', FS: '#14b8a6',
  }

  const withCoords = pitches.filter(p => p.plate_x != null && p.plate_z != null)

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, textAlign: 'center' }}>
        Location
      </div>
      <svg width={W} height={H} style={{ display: 'block', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
        {/* Chase zone */}
        <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2}
          fill="none" stroke="#1e293b" strokeWidth={1} rx={3} />
        {/* Strike zone */}
        <rect x={szX} y={szY} width={szW} height={szH2}
          fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={1.5} rx={2} />
        {/* Grid lines inside zone (3x3) */}
        {[1, 2].map(i => (
          <g key={i}>
            <line x1={szX + szW * i / 3} y1={szY} x2={szX + szW * i / 3} y2={szY + szH2}
              stroke="#1e3a5f" strokeWidth={0.5} />
            <line x1={szX} y1={szY + szH2 * i / 3} x2={szX + szW} y2={szY + szH2 * i / 3}
              stroke="#1e3a5f" strokeWidth={0.5} />
          </g>
        ))}
        {/* Pitch dots */}
        {withCoords.map((p, i) => {
          const cx = toSvgX(p.plate_x)
          const cy = toSvgY(p.plate_z)
          const color = PITCH_COLORS[p.pitch_type] || '#64748b'
          const isFinal = i === pitches.length - 1
          return (
            <g key={i}>
              {isFinal && (
                <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.2} />
              )}
              <circle cx={cx} cy={cy} r={isFinal ? 5 : 4}
                fill={color} stroke="#0f172a" strokeWidth={1} opacity={0.9} />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={7} fontWeight={700}>{i + 1}</text>
            </g>
          )
        })}
        {/* Home plate hint */}
        <polygon points={`${W/2},${H - 6} ${W/2 - 5},${H - 10} ${W/2 - 5},${H - 14} ${W/2 + 5},${H - 14} ${W/2 + 5},${H - 10}`}
          fill="#334155" />
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5, justifyContent: 'center' }}>
        {[...new Set(withCoords.map(p => p.pitch_type))].map(pt => (
          <span key={pt} style={{
            fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
            background: (PITCH_COLORS[pt] || '#64748b') + '33',
            border: `1px solid ${(PITCH_COLORS[pt] || '#64748b')}66`,
            color: PITCH_COLORS[pt] || '#64748b', fontFamily: 'monospace',
          }}>{pt}</span>
        ))}
      </div>
    </div>
  )
}

function panelStyle(compact) {
  return {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: compact ? '14px 16px' : '18px 24px',
    marginBottom: compact ? 16 : 24,
  }
}
