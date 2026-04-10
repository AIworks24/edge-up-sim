// src/app/api/admin/test-stats/route.ts
// TEMPORARY diagnostic — delete after confirming stats are correct
//
// Hit in browser: /api/admin/test-stats?secret=YOUR_CRON_SECRET
// Returns the exact stats getTeamStats() returns for IND and PHI

import { NextRequest, NextResponse } from 'next/server'
import { getTeamStats } from '@/lib/msf/stats'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // IND = 87, PHI = 85 — confirmed from diagnostic
    const [ind, phi] = await Promise.all([
      getTeamStats('87', 'nba'),
      getTeamStats('85', 'nba'),
    ])

    return NextResponse.json({
      indiana: {
        team_name:    ind.team_name,
        team_id:      ind.team_id,
        games_played: ind.games_played,
        season_ORtg:  ind.season.ORtg,
        season_DRtg:  ind.season.DRtg,
        season_Pace:  ind.season.Pace,
        last10_ORtg:  ind.last10.ORtg,
        raw_ppg:      ind.raw_season.ppg,
        raw_opp_ppg:  ind.raw_season.opp_ppg,
      },
      philadelphia: {
        team_name:    phi.team_name,
        team_id:      phi.team_id,
        games_played: phi.games_played,
        season_ORtg:  phi.season.ORtg,
        season_DRtg:  phi.season.DRtg,
        season_Pace:  phi.season.Pace,
        last10_ORtg:  phi.last10.ORtg,
        raw_ppg:      phi.raw_season.ppg,
        raw_opp_ppg:  phi.raw_season.opp_ppg,
      },
      expected: {
        indiana_ORtg:      '~108.5 (PPG 112.6)',
        philadelphia_ORtg: '~112.4 (PPG 115.9)',
        note: 'If ORtg values are near 113-114 for both, the old code is still running',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}