export default function WeightsPanel({ weights, countCategory }) {
  if (!weights) return null
  const entries = [
    ['Run Value',      weights.run_value,        'Runs prevented per pitch (RE24)'],
    ['Whiff Rate',     weights.whiff_rate,        'Swing-and-miss probability'],
    ['Called Strike',  weights.called_strike_rate,'Looking strike probability'],
    ['Chase Rate',     weights.chase_rate,        'Out-of-zone swing probability'],
    ['Contact Quality',weights.contact_quality,   'Suppressing hard contact (xwOBA)'],
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
        Active Weights · {countCategory?.replace(/_/g, ' ')}
      </div>
      {entries.map(([label, weight, desc]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent2)' }}>{(weight * 100).toFixed(0)}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${weight * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
        </div>
      ))}
    </div>
  )
}
