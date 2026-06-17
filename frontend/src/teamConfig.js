export const TEAM_COLORS = {
  108: { primary: '#BA0021', secondary: '#003263', name: 'Angels' },
  109: { primary: '#A71930', secondary: '#E3D4AD', name: 'Diamondbacks' },
  110: { primary: '#DF4601', secondary: '#000000', name: 'Orioles' },
  111: { primary: '#BD3039', secondary: '#0C2340', name: 'Red Sox' },
  112: { primary: '#0E3386', secondary: '#CC3433', name: 'Cubs' },
  113: { primary: '#C6011F', secondary: '#000000', name: 'Reds' },
  114: { primary: '#00385D', secondary: '#E31937', name: 'Guardians' },
  115: { primary: '#333366', secondary: '#C4CED4', name: 'Rockies' },
  116: { primary: '#0C2340', secondary: '#FA4616', name: 'Tigers' },
  117: { primary: '#002D62', secondary: '#EB6E1F', name: 'Astros' },
  118: { primary: '#004687', secondary: '#C09A5B', name: 'Royals' },
  119: { primary: '#005A9C', secondary: '#EF3E42', name: 'Dodgers' },
  120: { primary: '#AB0003', secondary: '#14225A', name: 'Nationals' },
  121: { primary: '#002D72', secondary: '#FF5910', name: 'Mets' },
  133: { primary: '#003831', secondary: '#EFB21E', name: 'Athletics' },
  134: { primary: '#27251F', secondary: '#FDB827', name: 'Pirates' },
  135: { primary: '#2F241D', secondary: '#FFC425', name: 'Padres' },
  136: { primary: '#0C2C56', secondary: '#005C5C', name: 'Mariners' },
  137: { primary: '#27251F', secondary: '#FD5A1E', name: 'Giants' },
  138: { primary: '#C41E3A', secondary: '#0C2340', name: 'Cardinals' },
  139: { primary: '#092C5C', secondary: '#8FBCE6', name: 'Rays' },
  140: { primary: '#003278', secondary: '#C0111F', name: 'Rangers' },
  141: { primary: '#134A8E', secondary: '#E8291C', name: 'Blue Jays' },
  142: { primary: '#002B5C', secondary: '#D31145', name: 'Twins' },
  143: { primary: '#E81828', secondary: '#284898', name: 'Phillies' },
  144: { primary: '#13274F', secondary: '#CE1141', name: 'Braves' },
  145: { primary: '#27251F', secondary: '#C4CED4', name: 'White Sox' },
  146: { primary: '#00A3E0', secondary: '#EF3340', name: 'Marlins' },
  147: { primary: '#003087', secondary: '#C4CED4', name: 'Yankees' },
  158: { primary: '#12284B', secondary: '#FFC52F', name: 'Brewers' },
}

export const DEFAULT_COLORS = { primary: '#1e3a5f', secondary: '#3b82f6', name: '' }

export function getTeamColors(teamId) {
  return TEAM_COLORS[teamId] || DEFAULT_COLORS
}

export function getLogoUrl(teamId) {
  if (!teamId) return null
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}
