import { useState, useEffect } from 'react'
import { getSequenceChain } from '../api'

const PITCH_COLORS = {
  FF:'#ef4444',SI:'#f97316',FC:'#eab308',
  SL:'#3b82f6',ST:'#8b5cf6',CU:'#06b6d4',KC:'#0891b2',
  CH:'#22c55e',FS:'#16a34a',
}

export default function SequenceChain({ pitcherId, batterId, balls, strikes, stand, currentPitch }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(0)

  useEffect(() => {
    if (!pitcherId || !batterId) return
    setLoading(true)
    getSequenceChain(pitcherId, batterId, balls, strikes, stand, currentPitch)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [pitcherId, batterId, balls, strikes, stand, currentPitch])

  if (loading) return (
    <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)' }}>
      Building sequence projection…
    </div>
  )
  if (!data?.chains?.length) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
        Sequence Chain Projection
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
        Top 3 starting pitches with optimal 2-pitch follow-up sequences
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.chains.map((chain, i) => (
          <ChainRow key={i} chain={chain} index={i} isOpen={expanded === i} onToggle={() => setExpanded(expanded === i ? -1 : i)} />
        ))}
      </div>
    </div>
  )
}

function ChainRow({ chain, index, isOpen, onToggle }) {
  const p = chain.pitch
  const color = PITCH_COLORS[p.pitch_type] || '#64748b'

  return (
    <div style={{ border: `1px solid ${isOpen ? color + '66' : 'var(--border)'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color .15s' }}>
      {/* Header */}
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 12px', background: isOpen ? color + '11' : 'transparent',
        border: 'none', cursor: 'pointer', transition: 'background .15s',
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>{index + 1}</span>

        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{p.pitch_label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.pitch_type}</span>

        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {p.whiff_rate != null && (
            <span>Whiff <span style={{ color: '#4ade80', fontWeight: 600 }}>{(p.whiff_rate * 100).toFixed(0)}%</span></span>
          )}
          <span style={{ fontFamily: 'monospace', color: 'var(--accent2)', fontWeight: 600 }}>
            {p.score?.toFixed(3)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded follow-ups */}
      {isOpen && chain.followups?.length > 0 && (
        <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${color}33` }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            If thrown → follow with:
          </div>
          {chain.followups.map((fu, fi) => (
            <FollowUpRow key={fi} followup={fu} depth={1} />
          ))}
        </div>
      )}
    </div>
  )
}

function FollowUpRow({ followup, depth }) {
  const p = followup.pitch
  const color = PITCH_COLORS[p.pitch_type] || '#64748b'
  const next = followup.followup

  return (
    <div style={{ marginLeft: depth * 16, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
        <div style={{ width: 3, height: 24, background: color, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {p.pitch_type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text)' }}>{p.pitch_label}</span>
        {p.best_zone && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→ {p.best_zone}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', color: 'var(--accent2)', fontWeight: 600 }}>
          {p.score?.toFixed(3)}
        </span>
      </div>

      {/* Level 3 */}
      {next && (
        <div style={{ marginLeft: 16, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', opacity: 0.8 }}>
            <div style={{ width: 3, height: 20, background: PITCH_COLORS[next.pitch_type] || '#64748b', borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: PITCH_COLORS[next.pitch_type] || '#64748b' }}>
              {next.pitch_type}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text)' }}>{next.pitch_label}</span>
            {next.best_zone && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→ {next.best_zone}</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', color: 'var(--accent2)', fontWeight: 600 }}>
              {next.score?.toFixed(3)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
