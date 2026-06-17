import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTodayGames } from '../api'
import { getTeamColors, getLogoUrl } from '../teamConfig'

export default function TodayGames() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getTodayGames()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 32 }}>Loading today's games…</div>
  if (!data || !data.games.length) return (
    <div style={{ color: 'var(--text-muted)', padding: 32, textAlign: 'center' }}>No games scheduled for today.</div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        {data.games.length} game{data.games.length !== 1 ? 's' : ''} today · Click a pitcher to open the full game preview with lineup navigation
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.games.map(game => (
          <GameCard key={game.game_pk} game={game} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}

function GameCard({ game, navigate }) {
  const awayColors = getTeamColors(game.away.team_id)
  const homeColors = getTeamColors(game.home.team_id)
  const awayLogo   = getLogoUrl(game.away.team_id)
  const homeLogo   = getLogoUrl(game.home.team_id)

  const gameTime = game.game_time
    ? new Date(game.game_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : '—'
  const isLive  = game.status?.includes('Progress') || game.status?.includes('Delay')
  const isFinal = game.status?.includes('Final') || game.status?.includes('Game Over')

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        background: `linear-gradient(135deg, ${awayColors.primary}22 0%, transparent 45%, ${homeColors.primary}22 100%)`,
        borderBottom: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {awayLogo && <img src={awayLogo} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>{game.away.team_abbr}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{game.away.team_name}</div>
          </div>
        </div>

        {/* Time / status */}
        <div style={{ textAlign: 'center', minWidth: 72 }}>
          {isLive  && <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '.08em' }}>● LIVE</div>}
          {isFinal && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>FINAL</div>}
          {!isLive && !isFinal && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{gameTime}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.5 }}>@</div>
        </div>

        {/* Home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>{game.home.team_abbr}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{game.home.team_name}</div>
          </div>
          {homeLogo && <img src={homeLogo} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
        </div>
      </div>

      {/* Pitcher matchup row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
        {[['away', game.away, awayColors], ['home', game.home, homeColors]].map(([side, team, colors]) => (
          <div key={side} style={{
            padding: '14px 20px',
            borderRight: side === 'away' ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
              {side === 'away' ? 'Away' : 'Home'} Starter
            </div>

            {team.probable_pitcher?.id ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{team.probable_pitcher.name}</div>
                <button
                  onClick={() => navigate(`/game/${game.game_pk}/${side}`)}
                  style={{
                    padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                    background: colors.primary, color: '#fff', border: 'none', cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    filter: 'brightness(1.1)',
                    boxShadow: `0 1px 6px ${colors.primary}66`,
                  }}
                >
                  Scout →
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>TBD</div>
            )}
          </div>
        ))}
      </div>

      {/* Lineup preview row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {[['away', game.away], ['home', game.home]].map(([side, team]) => (
          <div key={side} style={{
            padding: '10px 20px',
            borderRight: side === 'away' ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              Lineup
              {!team.lineup_confirmed && team.lineup?.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: '#451a03', padding: '1px 5px', borderRadius: 4 }}>PROJECTED</span>
              )}
            </div>
            {team.lineup?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {team.lineup.slice(0, 5).map((p, i) => (
                  <div key={p.id || i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 14 }}>{p.batting_order}.</span>
                    <span>{p.name}</span>
                  </div>
                ))}
                {team.lineup.length > 5 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    +{team.lineup.length - 5} more · click Scout → to see full lineup
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lineup not available</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
