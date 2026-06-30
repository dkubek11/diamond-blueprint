import { useState } from 'react'

const COUNT_CATEGORY_LABELS = {
  first_pitch:   'First Pitch',
  early_ahead:   'Early — Ahead',
  early_behind:  'Early — Behind',
  even:          'Even Count',
  hitters_count: "Hitter's Count",
  pitchers_count:"Pitcher's Count",
  two_strike:    'Two-Strike',
  full_count:    'Full Count',
}

const COUNT_CATEGORY_COLORS = {
  first_pitch:   'tag-blue',
  early_ahead:   'tag-green',
  early_behind:  'tag-yellow',
  even:          'tag-gray',
  hitters_count: 'tag-red',
  pitchers_count:'tag-green',
  two_strike:    'tag-blue',
  full_count:    'tag-yellow',
}

// What each component means in plain English
const COMPONENT_META = {
  run_value:       { label: 'Run Value',       formula: '−rv × weight',            desc: 'Negated expected run value per pitch. More negative RV = better outcome for pitcher = higher contribution.' },
  whiff:           { label: 'Whiff Rate',      formula: 'whiff% × weight',          desc: 'Swing-and-miss rate. Higher whiff = harder for batter to put ball in play.' },
  called_strike:   { label: 'Called Strike',   formula: 'csw% × weight',            desc: 'Called strike + whiff rate (CSW). Measures ability to get strikes without contact.' },
  chase:           { label: 'Chase Rate',      formula: 'chase% × weight',          desc: 'How often batters swing at pitches outside the zone. High chase = more exploitable off-speed.' },
  contact_quality: { label: 'Contact Quality', formula: '(0.500 − xwOBA) × weight', desc: 'Inverted xwOBA on contact. Lower xwOBA (weak contact) = higher contribution to score.' },
}

const GOAL_BADGE = {
  strikeout:   { label: '🔥 Best for K',           color: '#7c3aed' },
  groundball:  { label: '⬇️ Best for Ground Ball',  color: '#0369a1' },
  weakcontact: { label: '🪶 Best for Weak Contact', color: '#047857' },
  chase:       { label: '🪤 Best to Expand Zone',   color: '#b45309' },
}

export default function PitchCard({ rec, rank, selected, onClick, situationGoal, situationBest, vulnerability }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const isTop = rank === 0

  const components = rec.score_components || {}
  const weights    = rec.weights_used || {}
  const totalBase  = rec.base_score ?? 0
  const h2hMod     = rec.h2h_modifier ?? 0
  const resultMod  = rec.result_modifier ?? 0
  const movMod     = rec.movement_modifier ?? 0
  const finalScore = rec.score ?? 0

  // Convert pfx feet → inches for display
  const pfxX = rec.avg_pfx_x != null ? Math.round(rec.avg_pfx_x * 12) : null
  const pfxZ = rec.avg_pfx_z != null ? Math.round(rec.avg_pfx_z * 12) : null

  // Max absolute component value for bar scaling
  const maxComp = Math.max(0.001, ...Object.values(components).map(Math.abs))

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Main card */}
      <button
        onClick={onClick}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: selected ? 'var(--surface2)' : 'var(--surface)',
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: showBreakdown ? '10px 10px 0 0' : 10,
          padding: '14px 16px', cursor: 'pointer',
          transition: 'all .15s', borderBottom: showBreakdown ? 'none' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{rec.pitch_label}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>{rec.pitch_type}</span>
            {isTop && !situationGoal && <span className="tag tag-green">Top Pick</span>}
            {situationBest && situationGoal && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                background: GOAL_BADGE[situationGoal]?.color,
                color: '#fff',
              }}>{GOAL_BADGE[situationGoal]?.label}</span>
            )}
          </div>
          <ScoreBar score={finalScore} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <Stat label="Run Value" value={rec.avg_run_value != null ? rec.avg_run_value.toFixed(3) : '—'} good={rec.avg_run_value != null && rec.avg_run_value < 0} />
          <Stat label="Whiff %"   value={rec.whiff_rate   != null ? pct(rec.whiff_rate)            : '—'} good={rec.whiff_rate > 0.25} />
          <Stat label="Chase %"   value={rec.best_zone?.zone === 5 ? 'N/A' : (rec.chase_rate != null ? pct(rec.chase_rate) : '—')} good={rec.chase_rate > 0.30} />
          <Stat label="xwOBA"     value={rec.avg_xwoba    != null ? rec.avg_xwoba.toFixed(3)       : '—'} good={rec.avg_xwoba != null && rec.avg_xwoba < 0.300} />
        </div>
        {(situationGoal === 'groundball' || situationGoal === 'weakcontact') && vulnerability && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <Stat label="GB %" value={vulnerability.gb_pct != null ? pct(vulnerability.gb_pct) : '—'} good={vulnerability.gb_pct > 0.45} highlight={situationGoal === 'groundball'} />
            <Stat label="Hard Hit %" value={vulnerability.hard_hit_pct != null ? pct(vulnerability.hard_hit_pct) : '—'} good={vulnerability.hard_hit_pct != null && vulnerability.hard_hit_pct < 0.35} />
            <Stat label="Avg EV" value={vulnerability.avg_ev != null ? `${vulnerability.avg_ev} mph` : '—'} good={vulnerability.avg_ev != null && vulnerability.avg_ev < 88} />
          </div>
        )}

        {(pfxX != null || pfxZ != null) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {pfxX != null && (
              <MoveStat label="H-Break" value={`${pfxX > 0 ? '+' : ''}${pfxX}"`} title="Horizontal break in inches. Arm-side = positive for RHP." />
            )}
            {pfxZ != null && (
              <MoveStat label="V-Break" value={`${pfxZ > 0 ? '+' : ''}${pfxZ}"`} title="Induced vertical break in inches. Positive = rising action." />
            )}
          </div>
        )}

        {rec.best_zone && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Best location: <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>{rec.best_zone.zone_label}</span>
            {rec.best_zone.whiff_rate != null && <span> · {pct(rec.best_zone.whiff_rate)} whiff in that zone</span>}
          </div>
        )}

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {rec.count_category && (
            <span className={`tag ${COUNT_CATEGORY_COLORS[rec.count_category] || 'tag-gray'}`}>
              {COUNT_CATEGORY_LABELS[rec.count_category] || rec.count_category}
            </span>
          )}
          {h2hMod !== 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: h2hMod > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${h2hMod > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: h2hMod > 0 ? '#4ade80' : '#f87171',
            }}>
              H2H {h2hMod > 0 ? '▲' : '▼'} {h2hMod > 0 ? '+' : ''}{h2hMod.toFixed(3)}
            </span>
          )}
          {resultMod !== 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: resultMod > 0 ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${resultMod > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: resultMod > 0 ? '#fbbf24' : '#f87171',
            }}>
              SEQ {resultMod > 0 ? '▲' : '▼'} {resultMod > 0 ? '+' : ''}{resultMod.toFixed(3)}
            </span>
          )}
          {movMod !== 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: movMod > 0 ? 'rgba(168,85,247,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${movMod > 0 ? 'rgba(168,85,247,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: movMod > 0 ? '#c084fc' : '#f87171',
            }}>
              MOV {movMod > 0 ? '▲' : '▼'} {movMod > 0 ? '+' : ''}{movMod.toFixed(3)}
            </span>
          )}

          {/* Breakdown toggle */}
          <button
            onClick={e => { e.stopPropagation(); setShowBreakdown(v => !v) }}
            style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 4, border: '1px solid var(--border)',
              background: showBreakdown ? 'var(--accent)' : 'var(--surface2)',
              color: showBreakdown ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {showBreakdown ? '▲ Hide' : '▼ Score Breakdown'}
          </button>
        </div>
      </button>

      {/* Breakdown panel */}
      {showBreakdown && (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--accent)',
          borderTop: 'none', borderRadius: '0 0 10px 10px',
          padding: '16px 16px 14px',
        }}>
          {/* Formula header */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Score formula: </span>
            (−rv × w₁) + (whiff × w₂) + (csw × w₃) + (chase × w₄) + ((0.500 − xwOBA) × w₅){h2hMod !== 0 ? ' + H2H' : ''}{resultMod !== 0 ? ' + Sequence' : ''}{movMod !== 0 ? ' + Movement' : ''}
          </div>

          {/* Component rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {Object.entries(COMPONENT_META).map(([key, meta]) => {
              const contribution = components[key] ?? 0
              const weight = weights[key === 'whiff' ? 'whiff_rate' : key === 'called_strike' ? 'called_strike_rate' : key === 'contact_quality' ? 'contact_quality' : key] ?? 0
              const barPct = Math.abs(contribution) / maxComp * 100
              const isPositive = contribution >= 0
              return (
                <div key={key}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 52px 1fr 64px', alignItems: 'center', gap: 8 }}>
                    {/* Label + tooltip */}
                    <div title={`${meta.formula}\n\n${meta.desc}`} style={{ cursor: 'help' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{meta.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>w = {(weight * 100).toFixed(0)}%</div>
                    </div>

                    {/* Raw value */}
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {key === 'run_value'       && rec.avg_run_value != null  ? rec.avg_run_value.toFixed(3)  : ''}
                      {key === 'whiff'           && rec.whiff_rate    != null  ? pct(rec.whiff_rate)           : ''}
                      {key === 'called_strike'   && rec.chase_rate    != null  ? '—'                           : ''}
                      {key === 'chase'           && rec.chase_rate    != null  ? pct(rec.chase_rate)           : ''}
                      {key === 'contact_quality' && rec.avg_xwoba     != null  ? rec.avg_xwoba.toFixed(3)      : ''}
                    </div>

                    {/* Contribution bar */}
                    <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${barPct}%`,
                        background: isPositive ? '#22c55e' : '#ef4444',
                        transition: 'width .3s',
                      }} />
                    </div>

                    {/* Contribution value */}
                    <div style={{
                      fontSize: 12, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right',
                      color: isPositive ? '#4ade80' : '#f87171',
                    }}>
                      {contribution >= 0 ? '+' : ''}{contribution.toFixed(4)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Base score</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{totalBase.toFixed(4)}</span>
            </div>
            {h2hMod !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>H2H adjustment</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: h2hMod > 0 ? '#4ade80' : '#f87171' }}>
                  {h2hMod > 0 ? '+' : ''}{h2hMod.toFixed(4)}
                </span>
              </div>
            )}
            {resultMod !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Sequence modifier</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: resultMod > 0 ? '#fbbf24' : '#f87171' }}>
                  {resultMod > 0 ? '+' : ''}{resultMod.toFixed(4)}
                </span>
              </div>
            )}
            {movMod !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Movement fit</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: movMod > 0 ? '#c084fc' : '#f87171' }}>
                  {movMod > 0 ? '+' : ''}{movMod.toFixed(4)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 2 }}>
              <span style={{ fontWeight: 700 }}>Final score</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent2)' }}>{finalScore.toFixed(4)}</span>
            </div>
          </div>

          {/* Weight context note */}
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Weights are count-leveraged — they shift every pitch based on the game situation.
            In <strong style={{ color: 'var(--text)' }}>{COUNT_CATEGORY_LABELS[rec.count_category]}</strong> counts,{' '}
            {getCountContext(rec.count_category)}
          </div>
        </div>
      )}
    </div>
  )
}

function getCountContext(category) {
  const ctx = {
    first_pitch:    'run value and called strike dominate — setting tone matters most.',
    early_ahead:    'run value and whiff rate lead — keep the batter off-balance.',
    early_behind:   'run value and whiff rate lead — a strike is the priority.',
    even:           'weights are balanced across all five components.',
    hitters_count:  'run value is heavily weighted — getting ANY strike is the priority.',
    pitchers_count: 'whiff rate spikes — this is the put-away situation.',
    two_strike:     'whiff and chase dominate — expand the zone and hunt swing-and-miss.',
    full_count:     'chase rate surges — a chase call gives you the K without a swing.',
  }
  return ctx[category] || 'weights reflect the game situation.'
}

function MoveStat({ label, value, title }) {
  return (
    <div title={title} style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent2)' }}>{value}</span>
    </div>
  )
}

function Stat({ label, value, good, highlight }) {
  return (
    <div style={{ background: highlight ? 'rgba(3,105,161,0.15)' : 'var(--bg)', borderRadius: 6, padding: '6px 8px', border: highlight ? '1px solid #0369a1' : 'none' }}>
      <div style={{ fontSize: 10, color: highlight ? '#38bdf8' : 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: good ? 'var(--green)' : 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  )
}

function ScoreBar({ score }) {
  const p = Math.min(100, Math.max(0, (score + 0.1) / 0.3 * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{score.toFixed(3)}</span>
    </div>
  )
}

function pct(v) { return `${(v * 100).toFixed(1)}%` }
