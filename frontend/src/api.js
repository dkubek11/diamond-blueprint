const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const searchPlayers = (q) => get(`/players/search?q=${encodeURIComponent(q)}`)
export const getPlayer = (id) => get(`/players/${id}`)
export const getPitcherArsenal = (id, stand = 'R') => get(`/pitcher/${id}/arsenal?stand=${stand}`)
export const getMatchup = (pid, bid, stand = 'R') => get(`/matchup/${pid}/${bid}?stand=${stand}`)
export const simulate = (body) => post('/simulate', body)
export const getHitterProfile = (id) => get(`/hitter/${id}/profile`)
export const getTodayGames = () => get('/games/today')
export const getTomorrowGames = () => get('/games/tomorrow')
export const getH2H = (pitcherId, batterId) => get(`/h2h/${pitcherId}/${batterId}`)
export const getSequenceChain = (pitcherId, batterId, balls, strikes, stand, currentPitch) =>
  get(`/sequence-chain/${pitcherId}/${batterId}?balls=${balls}&strikes=${strikes}&stand=${stand}${currentPitch ? `&current_pitch=${currentPitch}` : ''}`)
