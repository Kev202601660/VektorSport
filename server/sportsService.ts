import type {
  InjuryReport,
  LeagueConfig,
  MatchDetailPayload,
  MatchLeader,
  MatchOdds,
  MatchSummaryCard,
  PlayerDetailPayload,
  PlayerStatLine,
  SportKey,
  StandingEntry,
  TeamBrief,
  TeamLastGame,
  TeamStatItem,
  LiveStreamEvent,
  WinProbPoint,
} from '../src/types/sports.ts';

export const LEAGUES: LeagueConfig[] = [
  { id: 'esp.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'LaLiga EA Sports', shortName: 'LaLiga', country: 'España', espnSportPath: 'soccer/esp.1' },
  { id: 'eng.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'Premier League', shortName: 'Premier', country: 'Inglaterra', espnSportPath: 'soccer/eng.1' },
  { id: 'uefa.champions', sport: 'soccer', sportLabel: 'Fútbol', name: 'UEFA Champions League', shortName: 'UCL', country: 'Europa', espnSportPath: 'soccer/uefa.champions' },
  { id: 'ita.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'Serie A', shortName: 'Serie A', country: 'Italia', espnSportPath: 'soccer/ita.1' },
  { id: 'ger.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'Bundesliga', shortName: 'Bundesliga', country: 'Alemania', espnSportPath: 'soccer/ger.1' },
  { id: 'mex.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'Liga MX', shortName: 'Liga MX', country: 'México', espnSportPath: 'soccer/mex.1' },
  { id: 'usa.1', sport: 'soccer', sportLabel: 'Fútbol', name: 'MLS', shortName: 'MLS', country: 'EE. UU.', espnSportPath: 'soccer/usa.1' },
  { id: 'nba', sport: 'basketball', sportLabel: 'Baloncesto', name: 'NBA', shortName: 'NBA', country: 'EE. UU.', espnSportPath: 'basketball/nba' },
  { id: 'wnba', sport: 'basketball', sportLabel: 'Baloncesto', name: 'WNBA', shortName: 'WNBA', country: 'EE. UU.', espnSportPath: 'basketball/wnba' },
  { id: 'nhl', sport: 'hockey', sportLabel: 'Hockey', name: 'NHL', shortName: 'NHL', country: 'Norteamérica', espnSportPath: 'hockey/nhl' },
  { id: 'nfl', sport: 'football', sportLabel: 'Fútbol Americano', name: 'NFL', shortName: 'NFL', country: 'EE. UU.', espnSportPath: 'football/nfl' },
  { id: 'college-football', sport: 'football', sportLabel: 'Fútbol Americano', name: 'NCAA Football', shortName: 'NCAAF', country: 'EE. UU.', espnSportPath: 'football/college-football' },
];

const SOFASCORE_TOURNAMENTS: Record<SportKey, number[]> = {
  soccer: [17, 8, 7], // Premier League, LaLiga, Champions League
  basketball: [132], // NBA
  hockey: [234], // NHL
  football: [9464], // NFL
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function getLeagueConfig(sport: SportKey, league: string): LeagueConfig {
  return (
    LEAGUES.find((l) => l.sport === sport && l.id === league) ||
    LEAGUES.find((l) => l.id === league) ||
    LEAGUES.find((l) => l.sport === sport) ||
    LEAGUES[0]
  );
}

function getRapidApiConfig(): { key: string; host: string } | null {
  const key = process.env.RAPIDAPI_KEY;
  if (!key || key.trim() === '' || key === 'MY_RAPIDAPI_KEY') return null;
  const host = (process.env.RAPIDAPI_HOST || 'sofascore.p.rapidapi.com').trim();
  return { key: key.trim(), host };
}

export function isRapidApiConfigured(): boolean {
  return getRapidApiConfig() !== null;
}

async function fetchJsonWithTimeout(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 8000
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VektorSport/1.0',
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al consultar ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

let rapidQuotaExhaustedUntil = 0;
let rapidLastCallAt = 0;
let rapidQueue: Promise<unknown> = Promise.resolve();
const RAPID_MIN_INTERVAL_MS = 1150;

function enqueueRapidCall<T>(task: () => Promise<T>): Promise<T> {
  const run = rapidQueue.then(async () => {
    const waitMs = Math.max(0, rapidLastCallAt + RAPID_MIN_INTERVAL_MS - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    rapidLastCallAt = Date.now();
    return task();
  });
  rapidQueue = run.catch(() => undefined);
  return run;
}

async function fetchSofascoreJson(
  endpoint: string,
  params?: Record<string, string | number>,
  timeoutMs = 7500
): Promise<any> {
  const cfg = getRapidApiConfig();
  if (!cfg) throw new Error('RAPIDAPI_KEY no configurada');
  if (Date.now() < rapidQuotaExhaustedUntil) {
    throw new Error('Cuota mensual de Sofascore RapidAPI temporalmente agotada');
  }

  const cleanPath = endpoint.replace(/^\/+/, '');
  const qs = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `https://${cfg.host}/${cleanPath}${qs}`;

  const doRequest = async (attempt: number): Promise<any> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VektorSport/1.0',
          'x-rapidapi-key': cfg.key,
          'x-rapidapi-host': cfg.host,
        },
      });
      if (res.status === 204) {
        return {};
      }
      if (res.status === 429) {
        const bodyText = await res.text().catch(() => '');
        if (/month/i.test(bodyText)) {
          rapidQuotaExhaustedUntil = Date.now() + 15 * 60_000;
          throw new Error('HTTP 429 Sofascore (cuota mensual)');
        }
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1400));
          rapidLastCallAt = Date.now();
          return doRequest(1);
        }
        throw new Error('HTTP 429 Sofascore (límite por segundo)');
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} al consultar ${url}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  return enqueueRapidCall(() => doRequest(0));
}

export async function fetchRapidMediaImage(
  kind: 'team' | 'player',
  id: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cfg = getRapidApiConfig();
  if (!cfg) return null;
  if (Date.now() < rapidQuotaExhaustedUntil) return null;
  const cleanId = id.replace(/[^0-9a-zA-Z_-]/g, '');
  if (!cleanId) return null;

  const cacheKey = `media:${kind}:${cleanId}`;
  const cached = getCached<{ buffer: Buffer; contentType: string }>(cacheKey);
  if (cached) return cached;

  const url =
    kind === 'team'
      ? `https://${cfg.host}/teams/get-logo?teamId=${encodeURIComponent(cleanId)}`
      : `https://${cfg.host}/players/get-image?playerId=${encodeURIComponent(cleanId)}`;

  try {
    return await enqueueRapidCall(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'x-rapidapi-key': cfg.key,
            'x-rapidapi-host': cfg.host,
          },
        });
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength === 0) return null;
        const contentType = res.headers.get('content-type') || 'image/png';
        const result = { buffer: Buffer.from(arrayBuf), contentType };
        return setCached(cacheKey, result, 3_600_000);
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    return null;
  }
}

function fractionalToAmerican(frac: string | undefined): string | undefined {
  if (!frac || !frac.includes('/')) return undefined;
  const [numStr, denStr] = frac.split('/');
  const num = Number(numStr);
  const den = Number(denStr);
  if (!num || !den || Number.isNaN(num) || Number.isNaN(den)) return undefined;
  const decimal = 1 + num / den;
  if (decimal >= 2) {
    return `+${Math.round((decimal - 1) * 100)}`;
  }
  return `${Math.round(-100 / (decimal - 1))}`;
}

function translateRapidStatus(ev: any): { state: 'pre' | 'in' | 'post'; detail: string } {
  const type = ev?.status?.type;
  const desc = String(ev?.status?.description || '');
  const state: 'pre' | 'in' | 'post' =
    type === 'inprogress' ? 'in' : type === 'finished' ? 'post' : 'pre';

  const mapDesc: Record<string, string> = {
    '1st half': '1.ª parte',
    '2nd half': '2.ª parte',
    Halftime: 'Descanso',
    Ended: 'Finalizado',
    'Not started': 'Programado',
    '1st quarter': '1.º cuarto',
    '2nd quarter': '2.º cuarto',
    '3rd quarter': '3.º cuarto',
    '4th quarter': '4.º cuarto',
    '1st period': '1.º periodo',
    '2nd period': '2.º periodo',
    '3rd period': '3.º periodo',
    Overtime: 'Prórroga',
    AP: 'Penaltis',
    AET: 'Tras prórroga',
  };

  return {
    state,
    detail: mapDesc[desc] || desc || (state === 'in' ? 'En vivo' : state === 'post' ? 'Finalizado' : 'Programado'),
  };
}

function mapRapidEventToSummary(ev: any, sport: SportKey): MatchSummaryCard | null {
  if (!ev?.id || !ev?.homeTeam || !ev?.awayTeam) return null;
  const { state, detail } = translateRapidStatus(ev);
  const homeId = String(ev.homeTeam.id);
  const awayId = String(ev.awayTeam.id);
  const homeScore = ev.homeScore?.current !== undefined ? String(ev.homeScore.current) : undefined;
  const awayScore = ev.awayScore?.current !== undefined ? String(ev.awayScore.current) : undefined;
  const winnerCode = ev.winnerCode; // 1 = home, 2 = away

  const leagueName = ev.tournament?.uniqueTournament?.name || ev.tournament?.name || 'Sofascore Live';
  const startMs = ev.startTimestamp ? Number(ev.startTimestamp) * 1000 : Date.now();

  return {
    id: `rapid_${ev.id}`,
    sport,
    league: 'rapid_live',
    leagueName,
    name: `${ev.awayTeam.name} vs ${ev.homeTeam.name}`,
    shortName: `${ev.awayTeam.shortName || ev.awayTeam.name} @ ${ev.homeTeam.shortName || ev.homeTeam.name}`,
    date: new Date(startMs).toISOString(),
    statusState: state,
    statusDetail: detail,
    statusShortDetail: detail,
    home: {
      id: homeId,
      name: ev.homeTeam.name || 'Local',
      shortName: ev.homeTeam.shortName || ev.homeTeam.name || 'Local',
      abbreviation: ev.homeTeam.nameCode || (ev.homeTeam.shortName || 'LOC').slice(0, 3).toUpperCase(),
      logo: `/api/sports/media/team/${homeId}`,
      score: homeScore,
      homeAway: 'home',
      winner: state === 'post' ? winnerCode === 1 : undefined,
    },
    away: {
      id: awayId,
      name: ev.awayTeam.name || 'Visitante',
      shortName: ev.awayTeam.shortName || ev.awayTeam.name || 'Visitante',
      abbreviation: ev.awayTeam.nameCode || (ev.awayTeam.shortName || 'VIS').slice(0, 3).toUpperCase(),
      logo: `/api/sports/media/team/${awayId}`,
      score: awayScore,
      homeAway: 'away',
      winner: state === 'post' ? winnerCode === 2 : undefined,
    },
    leaders: [],
    source: 'sofascore',
  };
}

async function getSofascoreCurrentSeasonId(tournamentId: number): Promise<number | null> {
  const cacheKey = `sofascoreSeason:${tournamentId}`;
  const cached = getCached<number>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchSofascoreJson('tournaments/get-seasons', { tournamentId });
    const firstId = Number(data?.seasons?.[0]?.id || 0);
    if (!firstId) return null;
    return setCached(cacheKey, firstId, 24 * 3_600_000);
  } catch {
    return null;
  }
}

export async function getRapidLiveMatches(sport: SportKey): Promise<MatchSummaryCard[]> {
  if (!isRapidApiConfigured()) return [];
  const cacheKey = `rapidLive:${sport}`;
  const cached = getCached<MatchSummaryCard[]>(cacheKey);
  if (cached) return cached;

  const tournamentIds = SOFASCORE_TOURNAMENTS[sport] || [17];
  const today = new Date().toISOString().slice(0, 10);
  const collected: any[] = [];
  const seenEventIds = new Set<string>();

  try {
    const primaryTid = tournamentIds[0];
    const scheduled = await fetchSofascoreJson('tournaments/get-scheduled-events', {
      tournamentId: primaryTid,
      date: today,
    }).catch(() => ({}));

    for (const ev of scheduled?.events || []) {
      const id = String(ev?.id || '');
      if (id && !seenEventIds.has(id)) {
        seenEventIds.add(id);
        collected.push(ev);
      }
    }

    if (collected.length < 6) {
      const seasonId = await getSofascoreCurrentSeasonId(primaryTid);
      if (seasonId) {
        const nextRes = await fetchSofascoreJson('tournaments/get-next-matches', {
          tournamentId: primaryTid,
          seasonId,
          pageIndex: 0,
        }).catch(() => ({}));
        for (const ev of nextRes?.events || []) {
          const id = String(ev?.id || '');
          if (id && !seenEventIds.has(id)) {
            seenEventIds.add(id);
            collected.push(ev);
          }
        }

        if (collected.length < 4) {
          const lastRes = await fetchSofascoreJson('tournaments/get-last-matches', {
            tournamentId: primaryTid,
            seasonId,
            pageIndex: 0,
          }).catch(() => ({}));
          for (const ev of lastRes?.events || []) {
            const id = String(ev?.id || '');
            if (id && !seenEventIds.has(id)) {
              seenEventIds.add(id);
              collected.push(ev);
            }
          }
        }
      }
    }

    const mapped = collected
      .slice(0, 14)
      .map((ev) => mapRapidEventToSummary(ev, sport))
      .filter((m): m is MatchSummaryCard => m !== null);

    mapped.sort((a, b) => {
      const rank = { in: 0, pre: 1, post: 2 };
      if (rank[a.statusState] !== rank[b.statusState]) return rank[a.statusState] - rank[b.statusState];
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return setCached(cacheKey, mapped, 60_000);
  } catch {
    return [];
  }
}

async function getRapidMatchDetail(sport: SportKey, rawEventId: string): Promise<MatchDetailPayload> {
  const cacheKey = `rapidMatch:${sport}:${rawEventId}`;
  const cached = getCached<MatchDetailPayload>(cacheKey);
  if (cached) return cached;

  const evData = await fetchSofascoreJson('matches/detail', { matchId: rawEventId });
  const ev = evData?.event;
  if (!ev) {
    throw new Error(`No se encontró el evento ${rawEventId} en Sofascore RapidAPI.`);
  }

  let match = mapRapidEventToSummary(ev, sport);
  if (!match) {
    throw new Error(`Datos incompletos para el evento ${rawEventId}.`);
  }

  if (ev.venue?.name || ev.venue?.stadium?.name) {
    match = { ...match, venue: ev.venue?.stadium?.name || ev.venue?.name };
  }

  // Execute enrichment endpoints sequentially to respect Sofascore BASIC 1 req/s rate limit
  const lineupsData = await fetchSofascoreJson('matches/get-lineups', { matchId: rawEventId }).catch(() => ({}));
  const oddsData = await fetchSofascoreJson('matches/get-all-odds', { matchId: rawEventId }).catch(() => ({}));
  const h2hData = await fetchSofascoreJson('matches/get-h2h', { matchId: rawEventId }).catch(() => ({}));

  const isStarted = match.statusState === 'in' || match.statusState === 'post';
  const statsData = isStarted
    ? await fetchSofascoreJson('matches/get-statistics', { matchId: rawEventId }).catch(() => ({}))
    : {};
  const graphData = isStarted
    ? await fetchSofascoreJson('matches/get-graph', { matchId: rawEventId }).catch(() => ({}))
    : {};

  // Parse live/prematch odds
  const markets: any[] = oddsData?.markets || [];
  const mainMarket =
    markets.find((m) => m.marketId === 1 || /full time|winner|moneyline/i.test(m.marketName || '')) || markets[0];
  if (mainMarket?.choices) {
    const homeChoice = mainMarket.choices.find((c: any) => c.name === '1' || /home/i.test(c.name || ''));
    const awayChoice = mainMarket.choices.find((c: any) => c.name === '2' || /away/i.test(c.name || ''));
    const drawChoice = mainMarket.choices.find((c: any) => c.name === 'X' || /draw/i.test(c.name || ''));
    match = {
      ...match,
      odds: {
        provider: 'RapidAPI Sofascore',
        details: mainMarket.marketName || 'Full time',
        homeMoneyline: fractionalToAmerican(homeChoice?.fractionalValue),
        awayMoneyline: fractionalToAmerican(awayChoice?.fractionalValue),
        drawMoneyline: fractionalToAmerican(drawChoice?.fractionalValue),
      },
    };
  }

  // Parse team statistics
  const teamStats: TeamStatItem[] = [];
  const allPeriod = (statsData?.statistics || []).find((s: any) => s.period === 'ALL') || statsData?.statistics?.[0];
  for (const grp of allPeriod?.groups || []) {
    for (const item of grp?.statisticsItems || []) {
      teamStats.push({
        name: String(item.key || item.name),
        label: String(item.name || item.key),
        homeValue: String(item.home ?? '-'),
        awayValue: String(item.away ?? '-'),
      });
    }
  }

  // Parse lineups & live player stats
  const mapLineupSide = (side: any, teamId: string, teamName: string, teamAbbrev: string): PlayerStatLine[] => {
    const players: any[] = side?.players || [];
    return players.slice(0, 18).map((entry) => {
      const p = entry?.player || {};
      const st = entry?.statistics || {};
      const statsMap: Record<string, string> = {};
      if (st.rating !== undefined) statsMap['VAL'] = String(st.rating);
      if (st.minutesPlayed !== undefined) statsMap['MIN'] = String(st.minutesPlayed);
      if (st.goals !== undefined) statsMap['GOL'] = String(st.goals);
      const assistsVal = st.goalAssist ?? st.assists;
      if (assistsVal !== undefined) statsMap['ASI'] = String(assistsVal);
      if (st.accuratePass !== undefined && st.totalPass !== undefined) {
        statsMap['PAS'] = `${st.accuratePass}/${st.totalPass}`;
      }
      if (st.points !== undefined) statsMap['PTS'] = String(st.points);
      if (st.rebounds !== undefined) statsMap['REB'] = String(st.rebounds);
      if (st.saves !== undefined) statsMap['PAR'] = String(st.saves);

      const primaryLabel = statsMap['VAL']
        ? 'VAL'
        : statsMap['PTS']
          ? 'PTS'
          : statsMap['GOL']
            ? 'GOL'
            : 'POS';
      const primaryValue =
        statsMap['VAL'] ||
        statsMap['PTS'] ||
        statsMap['GOL'] ||
        String(entry?.position || p?.position || 'JUG');

      return {
        playerId: `rapid_${p.id}`,
        name: p.name || 'Jugador',
        shortName: p.shortName || p.name || 'Jugador',
        headshot: p.id ? `/api/sports/media/player/${p.id}` : undefined,
        jersey: entry?.jerseyNumber ? String(entry.jerseyNumber) : p.jerseyNumber ? String(p.jerseyNumber) : undefined,
        position: String(entry?.position || p.position || 'JUG'),
        teamId,
        teamName,
        teamAbbrev,
        sport,
        league: 'rapid_live',
        starter: !entry?.substitute,
        stats: statsMap,
        primaryMetricLabel: primaryLabel,
        primaryMetricValue: primaryValue,
      };
    });
  };

  const homePlayers = mapLineupSide(lineupsData?.home, match.home.id, match.home.name, match.home.abbreviation);
  const awayPlayers = mapLineupSide(lineupsData?.away, match.away.id, match.away.name, match.away.abbreviation);

  // H2H predictor context
  let predictor: MatchDetailPayload['predictor'] | undefined;
  const duel = h2hData?.teamDuel;
  if (duel && (duel.homeWins || duel.awayWins || duel.draws)) {
    const total = Number(duel.homeWins || 0) + Number(duel.awayWins || 0) + Number(duel.draws || 0);
    if (total > 0) {
      predictor = {
        homeWinPct: Math.round((Number(duel.homeWins || 0) / total) * 1000) / 10,
        awayWinPct: Math.round((Number(duel.awayWins || 0) / total) * 1000) / 10,
        drawWinPct: Math.round((Number(duel.draws || 0) / total) * 1000) / 10,
      };
    }
  }

  const winProbTimeline = buildWinProbTimeline({
    match,
    predictor,
    homeLastFive: [],
    awayLastFive: [],
    rawWinProbability: [],
    sofascoreGraphPoints: Array.isArray(graphData?.graphPoints) ? graphData.graphPoints : undefined,
  });

  const payload: MatchDetailPayload = {
    match,
    homePlayers,
    awayPlayers,
    teamStats,
    homeLastFive: [],
    awayLastFive: [],
    injuries: [],
    standings: [],
    predictor,
    winProbTimeline,
    rapidApiEnriched: true,
  };

  return setCached(cacheKey, payload, 120_000);
}

function parseRecordWinPct(record: string | undefined): number | null {
  if (!record) return null;
  const parts = record.split('-').map((n) => Number(n));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const wins = parts[0];
  const losses = parts[1];
  const draws = parts[2] || 0;
  const total = wins + losses + draws;
  if (total <= 0) return null;
  return (wins + draws * 0.5) / total;
}

function buildWinProbTimeline(params: {
  match: MatchSummaryCard;
  predictor?: MatchDetailPayload['predictor'];
  homeLastFive: TeamLastGame[];
  awayLastFive: TeamLastGame[];
  rawWinProbability: any[];
  sofascoreGraphPoints?: Array<{ minute: number; value: number }>;
}): MatchDetailPayload['winProbTimeline'] {
  const { match, predictor, homeLastFive, awayLastFive, rawWinProbability, sofascoreGraphPoints } = params;
  const isSoccer = match.sport === 'soccer';

  // 1. Real play-by-play win probability when available from ESPN summary
  if (Array.isArray(rawWinProbability) && rawWinProbability.length >= 4) {
    const maxSamples = 24;
    const step = Math.max(1, Math.floor((rawWinProbability.length - 1) / (maxSamples - 1)));
    const sampled: any[] = [];
    for (let i = 0; i < rawWinProbability.length; i += step) {
      sampled.push({ item: rawWinProbability[i], idx: i });
    }
    const lastIdx = rawWinProbability.length - 1;
    if (sampled[sampled.length - 1]?.idx !== lastIdx) {
      sampled.push({ item: rawWinProbability[lastIdx], idx: lastIdx });
    }

    const points: WinProbPoint[] = sampled.map(({ item, idx }) => {
      const pctProgress = Math.round((idx / Math.max(1, lastIdx)) * 100);
      const rawHome = Number(item.homeWinPercentage ?? 0.5);
      const rawTie = Number(item.tiePercentage ?? 0);
      const homeProb = Math.round(rawHome * 1000) / 10;
      const drawProb = rawTie > 0.005 ? Math.round(rawTie * 1000) / 10 : undefined;
      const awayProb = Math.max(0, Math.round((100 - homeProb - (drawProb ?? 0)) * 10) / 10);

      let label = `${pctProgress}%`;
      if (pctProgress === 0) label = 'Inicio';
      else if (pctProgress >= 98) label = match.statusState === 'post' ? 'Final' : 'Actual';
      else if (isSoccer) label = `${Math.max(1, Math.round((pctProgress / 100) * 90))}'`;

      return {
        label,
        homeProb,
        awayProb,
        drawProb,
        context: pctProgress === 0 ? 'Inicio del encuentro' : pctProgress >= 98 ? match.statusDetail : `Progreso ${pctProgress}%`,
      };
    });

    return { mode: 'live_plays', points };
  }

  // 1b. Sofascore live/post momentum graph evolution
  if (Array.isArray(sofascoreGraphPoints) && sofascoreGraphPoints.length >= 4) {
    const maxSamples = 24;
    const step = Math.max(1, Math.floor((sofascoreGraphPoints.length - 1) / (maxSamples - 1)));
    const sampled: Array<{ minute: number; value: number }> = [];
    for (let i = 0; i < sofascoreGraphPoints.length; i += step) {
      sampled.push(sofascoreGraphPoints[i]);
    }
    const lastPt = sofascoreGraphPoints[sofascoreGraphPoints.length - 1];
    if (sampled[sampled.length - 1]?.minute !== lastPt.minute) {
      sampled.push(lastPt);
    }

    const points: WinProbPoint[] = sampled.map((pt, idx) => {
      const swing = Math.max(-100, Math.min(100, Number(pt.value ?? 0)));
      const drawProb = isSoccer
        ? Math.max(10, Math.round((26 - Math.abs(swing) * 0.14) * 10) / 10)
        : undefined;
      const available = 100 - (drawProb ?? 0);
      const homeShare = Math.min(0.88, Math.max(0.12, 0.5 + swing / 230));
      const homeProb = Math.round(available * homeShare * 10) / 10;
      const awayProb = Math.max(0, Math.round((available - homeProb) * 10) / 10);
      const isLast = idx === sampled.length - 1;
      const label =
        idx === 0
          ? 'Inicio'
          : isLast && match.statusState === 'post'
            ? 'Final'
            : `${pt.minute}'`;

      return {
        label,
        homeProb,
        awayProb,
        drawProb,
        context: `Minuto ${pt.minute}' · Impulso ${swing >= 0 ? `+${swing}` : swing}`,
      };
    });

    return { mode: 'live_plays', points };
  }

  // 2. Historical & live-context timeline grounded in real records, lastFiveGames, predictor, and current score
  const homeRecPct = parseRecordWinPct(match.home.record) ?? 0.52;
  const awayRecPct = parseRecordWinPct(match.away.record) ?? 0.48;
  const baselineHome = predictor?.homeWinPct ?? Math.round((homeRecPct / Math.max(0.1, homeRecPct + awayRecPct)) * 1000) / 10;
  const baselineDraw = predictor?.drawWinPct ?? (isSoccer ? 24 : 0);

  const normalizeTriple = (rawHomeScore: number, rawAwayScore: number, drawVal: number) => {
    const available = Math.max(10, 100 - drawVal);
    const total = Math.max(0.01, rawHomeScore + rawAwayScore);
    const homeProb = Math.round((rawHomeScore / total) * available * 10) / 10;
    const awayProb = Math.round((available - homeProb) * 10) / 10;
    return {
      homeProb,
      awayProb,
      drawProb: drawVal > 0 ? Math.round(drawVal * 10) / 10 : undefined,
    };
  };

  const points: WinProbPoint[] = [];
  const formSteps = Math.max(homeLastFive.length, awayLastFive.length, 5);

  // Trace trailing 5 historical games in chronological order (oldest -> most recent)
  let runningHomeEdge = baselineHome;
  let runningAwayEdge = Math.max(5, 100 - baselineHome - baselineDraw);

  for (let i = formSteps - 1; i >= 0; i--) {
    const hGame = homeLastFive[i];
    const aGame = awayLastFive[i];
    const hDelta = hGame ? (hGame.result === 'W' ? 3.5 : hGame.result === 'L' ? -3.5 : 0.5) : 0;
    const aDelta = aGame ? (aGame.result === 'W' ? 3.5 : aGame.result === 'L' ? -3.5 : 0.5) : 0;

    runningHomeEdge = Math.min(88, Math.max(12, runningHomeEdge + hDelta - aDelta * 0.4));
    runningAwayEdge = Math.min(88, Math.max(12, runningAwayEdge + aDelta - hDelta * 0.4));

    const norm = normalizeTriple(runningHomeEdge, runningAwayEdge, baselineDraw);
    const ctxParts: string[] = [];
    if (hGame) ctxParts.push(`${match.home.abbreviation}: ${hGame.result} vs ${hGame.opponent}`);
    if (aGame) ctxParts.push(`${match.away.abbreviation}: ${aGame.result} vs ${aGame.opponent}`);

    points.push({
      label: `J-${i + 1}`,
      ...norm,
      context: ctxParts.length > 0 ? ctxParts.join(' · ') : `Referencia histórica J-${i + 1}`,
    });
  }

  // Kickoff point anchored directly at predictor/record baseline
  const kickoffNorm = normalizeTriple(baselineHome, Math.max(5, 100 - baselineHome - baselineDraw), baselineDraw);
  points.push({
    label: 'Previo',
    ...kickoffNorm,
    context: 'Balance previo al inicio',
  });

  // In-game or final point adjusted by actual live/final scoreboard differential
  if (match.statusState === 'in' || match.statusState === 'post') {
    const hScore = Number(match.home.score ?? 0);
    const aScore = Number(match.away.score ?? 0);
    const diff = hScore - aScore;
    const scale = match.sport === 'soccer' ? 18 : match.sport === 'hockey' ? 14 : 3.2;

    if (match.statusState === 'post') {
      const finalHome = diff > 0 ? 100 : diff < 0 ? 0 : 0;
      const finalAway = diff < 0 ? 100 : 0;
      const finalDraw = diff === 0 && isSoccer ? 100 : isSoccer ? 0 : undefined;
      points.push({
        label: 'Final',
        homeProb: finalHome,
        awayProb: finalAway,
        drawProb: finalDraw,
        context: `Final: ${match.away.abbreviation} ${aScore} - ${hScore} ${match.home.abbreviation}`,
      });
    } else {
      const liveHomeWeight = Math.min(95, Math.max(5, kickoffNorm.homeProb + diff * scale));
      const liveAwayWeight = Math.min(95, Math.max(5, kickoffNorm.awayProb - diff * scale));
      const liveDraw = isSoccer ? (diff === 0 ? Math.min(40, baselineDraw + 8) : Math.max(8, baselineDraw - Math.abs(diff) * 7)) : 0;
      const liveNorm = normalizeTriple(liveHomeWeight, liveAwayWeight, liveDraw);
      points.push({
        label: 'En vivo',
        ...liveNorm,
        context: `${match.statusDetail} · ${match.away.abbreviation} ${aScore} - ${hScore} ${match.home.abbreviation}`,
      });
    }
  }

  return { mode: 'historical_trend', points };
}

async function getRapidPlayerDetail(
  sport: SportKey,
  league: string,
  rawPlayerId: string
): Promise<PlayerDetailPayload> {
  const cacheKey = `rapidPlayer:${rawPlayerId}`;
  const cached = getCached<PlayerDetailPayload>(cacheKey);
  if (cached) return cached;

  const pData = await fetchSofascoreJson('players/detail', { playerId: rawPlayerId });
  const lastEventsData = await fetchSofascoreJson('players/get-last-matches', {
    playerId: rawPlayerId,
    pageIndex: 0,
  }).catch(() => ({}));

  const p = pData?.player || {};
  const team = p.team || {};
  const teamId = team.id ? String(team.id) : '';
  const events: any[] = (lastEventsData?.events || []).slice(0, 8);

  const seasonSummary: Array<{ label: string; value: string }> = [
    { label: 'Posición', value: String(p.position || 'N/D') },
    { label: 'País', value: String(p.country?.name || 'N/D') },
    { label: 'Dorsal', value: p.jerseyNumber ? `#${p.jerseyNumber}` : 'N/D' },
  ];
  if (p.preferredFoot) seasonSummary.push({ label: 'Perfil', value: String(p.preferredFoot) });
  if (p.proposedMarketValueRaw?.value) {
    const mVal = Number(p.proposedMarketValueRaw.value) / 1_000_000;
    seasonSummary.push({
      label: 'Valor mercado',
      value: `${mVal >= 1 ? mVal.toFixed(1) + 'M' : (mVal * 1000).toFixed(0) + 'K'} ${p.proposedMarketValueRaw.currency || 'EUR'}`,
    });
  }
  if (p.dateOfBirthTimestamp) {
    const age = Math.floor((Date.now() - Number(p.dateOfBirthTimestamp) * 1000) / (365.25 * 86400 * 1000));
    if (age > 14 && age < 60) {
      seasonSummary.push({ label: 'Edad', value: `${age} años` });
    }
  }

  const recentGames = events.map((ev) => {
    const isHome = String(ev.homeTeam?.id) === teamId;
    const opp = isHome ? ev.awayTeam?.shortName || ev.awayTeam?.name : ev.homeTeam?.shortName || ev.homeTeam?.name;
    const hScore = ev.homeScore?.current ?? '-';
    const aScore = ev.awayScore?.current ?? '-';
    return {
      date: ev.startTimestamp
        ? new Date(Number(ev.startTimestamp) * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : '-',
      opponent: String(opp || 'Rival'),
      result: `${hScore} - ${aScore}`,
      stats: { Torneo: String(ev.tournament?.name || '-') },
    };
  });

  const payload: PlayerDetailPayload = {
    playerId: `rapid_${rawPlayerId}`,
    sport,
    league,
    name: p.name || 'Jugador',
    teamName: team.name || 'Equipo',
    teamAbbrev: team.nameCode || (team.shortName || 'EQ').slice(0, 3).toUpperCase(),
    teamLogo: teamId ? `/api/sports/media/team/${teamId}` : undefined,
    position: String(p.position || 'Jugador'),
    jersey: p.jerseyNumber ? String(p.jerseyNumber) : undefined,
    headshot: `/api/sports/media/player/${rawPlayerId}`,
    seasonSummary,
    recentGames,
    statColumns: ['Torneo'],
    latestNews: [],
  };

  return setCached(cacheKey, payload, 180_000);
}

function translateStatusDetail(state: 'pre' | 'in' | 'post', rawDetail: string): string {
  if (state === 'post') {
    if (/FT/i.test(rawDetail)) return 'Finalizado (FT)';
    if (/Final/i.test(rawDetail)) return 'Finalizado';
    return rawDetail || 'Finalizado';
  }
  if (state === 'in') {
    return rawDetail
      .replace(/Halftime/i, 'Descanso')
      .replace(/End of/i, 'Fin de')
      .replace(/1st/g, '1.º')
      .replace(/2nd/g, '2.º')
      .replace(/3rd/g, '3.º')
      .replace(/4th/g, '4.º');
  }
  return rawDetail || 'Programado';
}

function mapCompetitor(c: any): TeamBrief {
  const team = c?.team || {};
  const records: any[] = c?.records || [];
  const overallRecord = records.find((r) => r.type === 'total' || r.name === 'overall')?.summary || records[0]?.summary || '';
  return {
    id: String(team.id || c?.id || ''),
    name: team.displayName || team.name || 'Equipo',
    shortName: team.shortDisplayName || team.name || team.abbreviation || 'Equipo',
    abbreviation: team.abbreviation || (team.shortDisplayName || 'EQ').slice(0, 4).toUpperCase(),
    logo: team.logo || team.logos?.[0]?.href || '',
    color: team.color ? `#${team.color}` : undefined,
    score: c?.score !== undefined ? String(c.score) : undefined,
    record: overallRecord || undefined,
    homeAway: c?.homeAway === 'away' ? 'away' : 'home',
    winner: Boolean(c?.winner),
    form: c?.form || undefined,
  };
}

function mapOdds(comp: any): MatchOdds | undefined {
  const oddsList: any[] = comp?.odds || [];
  const primary = oddsList[0];
  if (!primary) return undefined;
  return {
    provider: primary.provider?.name || 'Mercado',
    details: primary.details || '',
    overUnder: typeof primary.overUnder === 'number' ? primary.overUnder : undefined,
    spread: typeof primary.spread === 'number' ? primary.spread : undefined,
    homeMoneyline:
      primary.homeTeamOdds?.moneyLine !== undefined
        ? String(primary.homeTeamOdds.moneyLine)
        : primary.moneyline?.home?.close?.odds,
    awayMoneyline:
      primary.awayTeamOdds?.moneyLine !== undefined
        ? String(primary.awayTeamOdds.moneyLine)
        : primary.moneyline?.away?.close?.odds,
    drawMoneyline: primary.drawOdds?.moneyLine !== undefined ? String(primary.drawOdds.moneyLine) : undefined,
  };
}

function mapLeaders(comp: any): MatchLeader[] {
  const result: MatchLeader[] = [];
  const competitors: any[] = comp?.competitors || [];
  for (const c of competitors) {
    const teamId = String(c?.team?.id || '');
    const teamAbbrev = c?.team?.abbreviation || '';
    const leaders: any[] = c?.leaders || [];
    for (const cat of leaders.slice(0, 2)) {
      const top = cat?.leaders?.[0];
      if (!top?.athlete) continue;
      result.push({
        category: cat.shortDisplayName || cat.displayName || cat.name || 'Stat',
        playerId: String(top.athlete.id || ''),
        playerName: top.athlete.displayName || top.athlete.shortName || 'Jugador',
        headshot: top.athlete.headshot || undefined,
        position: top.athlete.position?.abbreviation || undefined,
        teamId,
        teamAbbrev,
        displayValue: String(top.displayValue || ''),
      });
    }
  }
  return result;
}

export async function getScoreboard(sport: SportKey, league: string): Promise<MatchSummaryCard[]> {
  if (league === 'rapid_live') {
    return getRapidLiveMatches(sport);
  }

  const cfg = getLeagueConfig(sport, league);
  const cacheKey = `scoreboard:${cfg.sport}:${cfg.id}`;
  const cached = getCached<MatchSummaryCard[]>(cacheKey);
  if (cached) return cached;

  const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnSportPath}/scoreboard`;
  let data: any;
  try {
    data = await fetchJsonWithTimeout(url);
  } catch {
    return [];
  }

  const events: any[] = data?.events || [];
  const rapidActive = isRapidApiConfigured();
  const matches: MatchSummaryCard[] = events
    .map((ev) => {
      const comp = ev?.competitions?.[0];
      if (!comp) return null;
      const competitors: any[] = comp.competitors || [];
      const homeRaw = competitors.find((c) => c.homeAway === 'home') || competitors[0];
      const awayRaw = competitors.find((c) => c.homeAway === 'away') || competitors[1];
      if (!homeRaw || !awayRaw) return null;

      const rawState = ev?.status?.type?.state;
      const statusState: 'pre' | 'in' | 'post' =
        rawState === 'in' ? 'in' : rawState === 'post' ? 'post' : 'pre';

      const rawDetail = ev?.status?.type?.shortDetail || ev?.status?.type?.detail || '';
      const broadcast = comp.broadcasts?.[0]?.names?.[0] || comp.geoBroadcasts?.[0]?.media?.shortName || undefined;

      return {
        id: String(ev.id),
        sport: cfg.sport,
        league: cfg.id,
        leagueName: cfg.shortName,
        name: ev.name || `${awayRaw.team?.shortDisplayName || 'Visitante'} vs ${homeRaw.team?.shortDisplayName || 'Local'}`,
        shortName: ev.shortName || `${awayRaw.team?.abbreviation || 'VIS'} @ ${homeRaw.team?.abbreviation || 'LOC'}`,
        date: ev.date || new Date().toISOString(),
        statusState,
        statusDetail: translateStatusDetail(statusState, rawDetail),
        statusShortDetail: rawDetail,
        clock: ev?.status?.displayClock || undefined,
        period: typeof ev?.status?.period === 'number' ? ev.status.period : undefined,
        venue: comp.venue?.fullName || undefined,
        broadcast,
        home: mapCompetitor(homeRaw),
        away: mapCompetitor(awayRaw),
        odds: mapOdds(comp),
        leaders: mapLeaders(comp),
        source: rapidActive ? 'espn+rapidapi' : 'espn',
      } as MatchSummaryCard;
    })
    .filter((m): m is MatchSummaryCard => m !== null);

  matches.sort((a, b) => {
    const rank = { in: 0, pre: 1, post: 2 };
    if (rank[a.statusState] !== rank[b.statusState]) return rank[a.statusState] - rank[b.statusState];
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return setCached(cacheKey, matches, 20_000);
}

export async function getMultiSportOverview(leaguesToLoad: string[]): Promise<MatchSummaryCard[]> {
  const uniqueLeagues = Array.from(new Set(leaguesToLoad)).slice(0, 8);
  const leaguePromises = uniqueLeagues.map(async (leagueId) => {
    if (leagueId === 'rapid_live') {
      const soccer = await getRapidLiveMatches('soccer');
      const basketball = await getRapidLiveMatches('basketball');
      const hockey = await getRapidLiveMatches('hockey');
      const football = await getRapidLiveMatches('football');
      return [...soccer, ...basketball, ...hockey, ...football];
    }
    const cfg = LEAGUES.find((l) => l.id === leagueId) || LEAGUES[0];
    return getScoreboard(cfg.sport, cfg.id);
  });

  // Include cached Sofascore events without blocking fast ESPN overview loads
  const rapidCachedGlobal: MatchSummaryCard[] = !uniqueLeagues.includes('rapid_live')
    ? (['soccer', 'basketball', 'hockey', 'football'] as SportKey[])
        .flatMap((s) => getCached<MatchSummaryCard[]>(`rapidLive:${s}`) || [])
        .slice(0, 16)
    : [];

  const leagueResults = await Promise.all(leaguePromises);
  const combined = [...rapidCachedGlobal, ...leagueResults.flat()];
  const deduped: MatchSummaryCard[] = [];
  const seenKeys = new Set<string>();
  for (const m of combined) {
    const teamSignature = `${m.sport}:${m.home.shortName.toLowerCase()}:${m.away.shortName.toLowerCase()}`;
    if (seenKeys.has(m.id) || seenKeys.has(teamSignature)) continue;
    seenKeys.add(m.id);
    seenKeys.add(teamSignature);
    deduped.push(m);
  }

  deduped.sort((a, b) => {
    const rank = { in: 0, pre: 1, post: 2 };
    if (rank[a.statusState] !== rank[b.statusState]) return rank[a.statusState] - rank[b.statusState];
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  return deduped;
}

async function fetchTeamRosterPlayers(
  cfg: LeagueConfig,
  teamId: string,
  teamName: string,
  teamAbbrev: string
): Promise<PlayerStatLine[]> {
  const cacheKey = `roster:${cfg.sport}:${cfg.id}:${teamId}`;
  const cached = getCached<PlayerStatLine[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJsonWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnSportPath}/teams/${teamId}?enable=roster,stats`,
      undefined,
      6500
    );
    const athletes: any[] = data?.team?.athletes || [];
    const players: PlayerStatLine[] = athletes.slice(0, 14).map((a) => {
      const statsMap: Record<string, string> = {};
      const categories: any[] = a?.statistics?.splits?.categories || [];
      for (const cat of categories) {
        for (const st of cat?.stats || []) {
          if (st?.abbreviation && st?.displayValue !== undefined) {
            statsMap[String(st.abbreviation)] = String(st.displayValue);
          }
        }
      }
      const pos = a?.position?.abbreviation || a?.position?.name || 'JUG';
      let primaryLabel = 'POS';
      let primaryVal = pos;
      if (cfg.sport === 'basketball') {
        primaryLabel = statsMap['PTS'] ? 'PTS' : 'EXP';
        primaryVal = statsMap['PTS'] || (a?.experience?.years !== undefined ? `${a.experience.years}a` : pos);
      } else if (cfg.sport === 'soccer') {
        primaryLabel = statsMap['G'] ? 'GOL' : 'POS';
        primaryVal = statsMap['G'] || pos;
      } else if (cfg.sport === 'hockey') {
        primaryLabel = statsMap['P'] ? 'PTS' : 'POS';
        primaryVal = statsMap['P'] || pos;
      } else if (cfg.sport === 'football') {
        primaryLabel = statsMap['YDS'] ? 'YDS' : 'POS';
        primaryVal = statsMap['YDS'] || pos;
      }

      return {
        playerId: String(a.id),
        name: a.displayName || a.fullName || 'Jugador',
        shortName: a.shortName || a.displayName || 'Jugador',
        headshot: a.headshot?.href || undefined,
        jersey: a.jersey ? String(a.jersey) : undefined,
        position: pos,
        teamId,
        teamName,
        teamAbbrev,
        sport: cfg.sport,
        league: cfg.id,
        stats: statsMap,
        primaryMetricLabel: primaryLabel,
        primaryMetricValue: primaryVal,
      };
    });
    return setCached(cacheKey, players, 300_000);
  } catch {
    return [];
  }
}

function extractPlayersFromSummary(summary: any, cfg: LeagueConfig, homeId: string, awayId: string): {
  homePlayers: PlayerStatLine[];
  awayPlayers: PlayerStatLine[];
} {
  const homePlayers: PlayerStatLine[] = [];
  const awayPlayers: PlayerStatLine[] = [];

  const boxPlayers: any[] = summary?.boxscore?.players || [];
  for (const teamBlock of boxPlayers) {
    const teamId = String(teamBlock?.team?.id || '');
    const teamName = teamBlock?.team?.displayName || '';
    const teamAbbrev = teamBlock?.team?.abbreviation || '';
    const statGroups: any[] = teamBlock?.statistics || [];
    const seen = new Map<string, PlayerStatLine>();

    for (const group of statGroups) {
      const labels: string[] = group?.labels || group?.names || [];
      for (const athEntry of group?.athletes || []) {
        const ath = athEntry?.athlete;
        if (!ath?.id) continue;
        const pid = String(ath.id);
        const rawStats: string[] = athEntry?.stats || [];
        const existing: PlayerStatLine = seen.get(pid) || {
          playerId: pid,
          name: ath.displayName || 'Jugador',
          shortName: ath.shortName || ath.displayName || 'Jugador',
          headshot: ath.headshot?.href || undefined,
          jersey: ath.jersey ? String(ath.jersey) : undefined,
          position: ath.position?.abbreviation || 'JUG',
          teamId,
          teamName,
          teamAbbrev,
          sport: cfg.sport,
          league: cfg.id,
          starter: Boolean(athEntry?.starter),
          stats: {},
          primaryMetricLabel: labels[0] || 'STAT',
          primaryMetricValue: rawStats[0] || '-',
        };

        labels.forEach((lbl, idx) => {
          if (rawStats[idx] !== undefined && rawStats[idx] !== '') {
            existing.stats[lbl] = String(rawStats[idx]);
          }
        });

        if (cfg.sport === 'basketball' && existing.stats['PTS']) {
          existing.primaryMetricLabel = 'PTS';
          existing.primaryMetricValue = existing.stats['PTS'];
        } else if (cfg.sport === 'hockey' && (existing.stats['G'] || existing.stats['SV%'])) {
          existing.primaryMetricLabel = existing.stats['SV%'] ? 'SV%' : 'G';
          existing.primaryMetricValue = existing.stats['SV%'] || existing.stats['G'];
        } else if (cfg.sport === 'football' && (existing.stats['YDS'] || existing.stats['TOT'])) {
          existing.primaryMetricLabel = existing.stats['YDS'] ? 'YDS' : 'TAK';
          existing.primaryMetricValue = existing.stats['YDS'] || existing.stats['TOT'];
        }
        seen.set(pid, existing);
      }
    }

    const list = Array.from(seen.values());
    if (teamId === homeId) homePlayers.push(...list);
    else if (teamId === awayId) awayPlayers.push(...list);
  }

  const rosters: any[] = summary?.rosters || [];
  if (homePlayers.length === 0 && awayPlayers.length === 0 && rosters.length > 0) {
    for (const r of rosters) {
      const teamId = String(r?.team?.id || '');
      const teamName = r?.team?.displayName || '';
      const teamAbbrev = r?.team?.abbreviation || '';
      const entries: any[] = r?.roster || [];
      const mapped: PlayerStatLine[] = entries.slice(0, 15).map((entry) => {
        const ath = entry?.athlete || {};
        const statsMap: Record<string, string> = {};
        for (const st of entry?.stats || []) {
          if (st?.abbreviation || st?.shortDisplayName) {
            statsMap[st.abbreviation || st.shortDisplayName] = String(st.displayValue ?? st.value ?? '-');
          }
        }
        const goals = statsMap['G'] || statsMap['GL'] || '0';
        return {
          playerId: String(ath.id || ''),
          name: ath.displayName || 'Jugador',
          shortName: ath.shortName || ath.displayName || 'Jugador',
          headshot: ath.headshot?.href || undefined,
          jersey: entry?.jersey ? String(entry.jersey) : undefined,
          position: entry?.position?.abbreviation || ath?.position?.abbreviation || 'JUG',
          teamId,
          teamName,
          teamAbbrev,
          sport: cfg.sport,
          league: cfg.id,
          starter: Boolean(entry?.starter),
          stats: statsMap,
          primaryMetricLabel: statsMap['G'] !== undefined ? 'GOL' : 'POS',
          primaryMetricValue: statsMap['G'] !== undefined ? goals : (entry?.position?.abbreviation || 'TIT'),
        };
      });
      if (teamId === homeId) homePlayers.push(...mapped);
      else if (teamId === awayId) awayPlayers.push(...mapped);
    }
  }

  return { homePlayers, awayPlayers };
}

export async function getStandings(sport: SportKey, league: string): Promise<StandingEntry[]> {
  if (league === 'rapid_live') return [];
  const cfg = getLeagueConfig(sport, league);
  const cacheKey = `standings:${cfg.sport}:${cfg.id}`;
  const cached = getCached<StandingEntry[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJsonWithTimeout(
      `https://site.api.espn.com/apis/v2/sports/${cfg.espnSportPath}/standings`,
      undefined,
      6500
    );
    const children: any[] = data?.children || [];
    const entriesRaw: any[] = children[0]?.standings?.entries || data?.standings?.entries || [];
    const list: StandingEntry[] = entriesRaw.slice(0, 20).map((entry, idx) => {
      const team = entry?.team || {};
      const stats: any[] = entry?.stats || [];
      const findStat = (names: string[]) =>
        stats.find((s) => names.includes(s.name) || names.includes(s.abbreviation))?.displayValue || '-';
      return {
        teamId: String(team.id || ''),
        teamName: team.displayName || team.name || 'Equipo',
        teamAbbrev: team.abbreviation || 'EQ',
        logo: team.logos?.[0]?.href || undefined,
        rank: idx + 1,
        played: findStat(['gamesPlayed', 'GP']),
        wins: findStat(['wins', 'W']),
        losses: findStat(['losses', 'L']),
        draws: cfg.sport === 'soccer' ? findStat(['ties', 'D']) : undefined,
        points: cfg.sport === 'soccer' || cfg.sport === 'hockey' ? findStat(['points', 'PTS']) : findStat(['winPercent', 'PCT']),
        diff: findStat(['pointDifferential', 'DIFF', 'differential']),
        streak: findStat(['streak', 'STRK']),
      };
    });
    return setCached(cacheKey, list, 300_000);
  } catch {
    return [];
  }
}

export async function getMatchDetail(sport: SportKey, league: string, eventId: string): Promise<MatchDetailPayload> {
  if (eventId.startsWith('rapid_')) {
    return getRapidMatchDetail(sport, eventId.replace(/^rapid_/, ''));
  }

  const cfg = getLeagueConfig(sport, league);
  const cacheKey = `match:${cfg.sport}:${cfg.id}:${eventId}`;
  const cached = getCached<MatchDetailPayload>(cacheKey);
  if (cached) return cached;

  const [scoreboardList, summaryData, standingsData] = await Promise.all([
    getScoreboard(cfg.sport, cfg.id),
    fetchJsonWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/${cfg.espnSportPath}/summary?event=${eventId}`).catch(() => ({})),
    getStandings(cfg.sport, cfg.id),
  ]);

  let match = scoreboardList.find((m) => m.id === eventId);
  const headerComp = summaryData?.header?.competitions?.[0];
  if (!match && headerComp) {
    const competitors: any[] = headerComp.competitors || [];
    const homeRaw = competitors.find((c) => c.homeAway === 'home') || competitors[0];
    const awayRaw = competitors.find((c) => c.homeAway === 'away') || competitors[1];
    const rawState = headerComp?.status?.type?.state;
    const statusState: 'pre' | 'in' | 'post' = rawState === 'in' ? 'in' : rawState === 'post' ? 'post' : 'pre';
    match = {
      id: eventId,
      sport: cfg.sport,
      league: cfg.id,
      leagueName: cfg.shortName,
      name: `${awayRaw?.team?.displayName || 'Visitante'} vs ${homeRaw?.team?.displayName || 'Local'}`,
      shortName: `${awayRaw?.team?.abbreviation || 'VIS'} @ ${homeRaw?.team?.abbreviation || 'LOC'}`,
      date: headerComp.date || new Date().toISOString(),
      statusState,
      statusDetail: translateStatusDetail(statusState, headerComp?.status?.type?.shortDetail || ''),
      statusShortDetail: headerComp?.status?.type?.shortDetail || '',
      venue: summaryData?.gameInfo?.venue?.fullName || undefined,
      home: mapCompetitor(homeRaw),
      away: mapCompetitor(awayRaw),
      odds: mapOdds({ odds: summaryData?.odds || summaryData?.pickcenter }),
      leaders: [],
      source: isRapidApiConfigured() ? 'espn+rapidapi' : 'espn',
    };
  }

  if (!match) {
    throw new Error(`No se encontró el partido ${eventId} en ${cfg.name}.`);
  }

  if (!match.odds && (summaryData?.pickcenter?.[0] || summaryData?.odds?.[0])) {
    const p = summaryData?.pickcenter?.[0] || summaryData?.odds?.[0];
    match = {
      ...match,
      odds: {
        provider: p.provider?.name || 'Mercado',
        details: p.details || '',
        overUnder: typeof p.overUnder === 'number' ? p.overUnder : undefined,
        spread: typeof p.spread === 'number' ? p.spread : undefined,
        homeMoneyline: p.homeTeamOdds?.moneyLine !== undefined ? String(p.homeTeamOdds.moneyLine) : undefined,
        awayMoneyline: p.awayTeamOdds?.moneyLine !== undefined ? String(p.awayTeamOdds.moneyLine) : undefined,
      },
    };
  }

  let { homePlayers, awayPlayers } = extractPlayersFromSummary(summaryData, cfg, match.home.id, match.away.id);
  if (homePlayers.length === 0 && match.home.id) {
    homePlayers = await fetchTeamRosterPlayers(cfg, match.home.id, match.home.name, match.home.abbreviation);
  }
  if (awayPlayers.length === 0 && match.away.id) {
    awayPlayers = await fetchTeamRosterPlayers(cfg, match.away.id, match.away.name, match.away.abbreviation);
  }

  const boxTeams: any[] = summaryData?.boxscore?.teams || [];
  const homeBox = boxTeams.find((t) => String(t?.team?.id) === match!.home.id) || boxTeams[1];
  const awayBox = boxTeams.find((t) => String(t?.team?.id) === match!.away.id) || boxTeams[0];
  const teamStats: TeamStatItem[] = [];
  if (homeBox?.statistics && awayBox?.statistics) {
    for (const hStat of homeBox.statistics as any[]) {
      const aStat = (awayBox.statistics as any[]).find((s) => s.name === hStat.name);
      if (aStat) {
        teamStats.push({
          name: hStat.name,
          label: hStat.label || hStat.abbreviation || hStat.name,
          homeValue: String(hStat.displayValue ?? '-'),
          awayValue: String(aStat.displayValue ?? '-'),
        });
      }
    }
  }

  const mapLastFive = (teamId: string): TeamLastGame[] => {
    const block = (summaryData?.lastFiveGames || []).find((b: any) => String(b?.team?.id) === teamId);
    const events: any[] = block?.events || [];
    return events.slice(0, 5).map((ev) => ({
      id: String(ev.id || ''),
      date: ev.gameDate || '',
      opponent: ev.opponent?.shortDisplayName || ev.opponent?.abbreviation || 'Rival',
      opponentLogo: ev.opponent?.logo || undefined,
      score: ev.score || '-',
      result: ev.gameResult === 'W' || ev.gameResult === 'L' || ev.gameResult === 'D' ? ev.gameResult : '-',
      homeAway: ev.atVs || '',
    }));
  };

  const injuries: InjuryReport[] = [];
  for (const teamInj of summaryData?.injuries || []) {
    const abbrev = teamInj?.team?.abbreviation || '';
    for (const inj of (teamInj?.injuries || []).slice(0, 5)) {
      injuries.push({
        playerName: inj?.athlete?.displayName || 'Jugador',
        position: inj?.athlete?.position?.abbreviation || '',
        status: inj?.status || 'Duda',
        detail: inj?.details?.detail || inj?.shortComment || '',
        teamAbbrev: abbrev,
      });
    }
  }

  let predictor: MatchDetailPayload['predictor'] | undefined;
  if (summaryData?.predictor?.homeTeam?.gameProjection) {
    const hPct = Number(summaryData.predictor.homeTeam.gameProjection);
    const aPct = Number(summaryData.predictor.awayTeam?.gameProjection ?? 100 - hPct);
    if (!Number.isNaN(hPct)) {
      predictor = {
        homeWinPct: Math.round(hPct * 10) / 10,
        awayWinPct: Math.round(aPct * 10) / 10,
      };
    }
  }

  const homeLastFive = mapLastFive(match.home.id);
  const awayLastFive = mapLastFive(match.away.id);
  const winProbTimeline = buildWinProbTimeline({
    match,
    predictor,
    homeLastFive,
    awayLastFive,
    rawWinProbability: Array.isArray(summaryData?.winprobability) ? summaryData.winprobability : [],
  });

  const payload: MatchDetailPayload = {
    match,
    homePlayers,
    awayPlayers,
    teamStats,
    homeLastFive,
    awayLastFive,
    injuries,
    standings: standingsData,
    predictor,
    winProbTimeline,
    rapidApiEnriched: isRapidApiConfigured(),
  };

  return setCached(cacheKey, payload, 30_000);
}

export async function getFeaturedPlayers(sport: SportKey, league: string): Promise<PlayerStatLine[]> {
  if (league === 'rapid_live') {
    const liveMatches = await getRapidLiveMatches(sport);
    const collected: PlayerStatLine[] = [];
    for (const m of liveMatches.slice(0, 3)) {
      try {
        const det = await getRapidMatchDetail(sport, m.id.replace(/^rapid_/, ''));
        collected.push(...det.homePlayers.slice(0, 8), ...det.awayPlayers.slice(0, 8));
      } catch {
        // continue
      }
    }
    return collected.slice(0, 40);
  }

  const cfg = getLeagueConfig(sport, league);
  const cacheKey = `featuredPlayers:${cfg.sport}:${cfg.id}`;
  const cached = getCached<PlayerStatLine[]>(cacheKey);
  if (cached) return cached;

  const matches = await getScoreboard(cfg.sport, cfg.id);
  const collected: PlayerStatLine[] = [];
  const seenIds = new Set<string>();

  for (const m of matches.slice(0, 8)) {
    for (const l of m.leaders) {
      if (!l.playerId || seenIds.has(l.playerId)) continue;
      seenIds.add(l.playerId);
      const isHome = l.teamId === m.home.id;
      collected.push({
        playerId: l.playerId,
        name: l.playerName,
        shortName: l.playerName,
        headshot: l.headshot,
        position: l.position || 'JUG',
        teamId: l.teamId,
        teamName: isHome ? m.home.name : m.away.name,
        teamAbbrev: l.teamAbbrev || (isHome ? m.home.abbreviation : m.away.abbreviation),
        sport: cfg.sport,
        league: cfg.id,
        stats: { [l.category]: l.displayValue },
        primaryMetricLabel: l.category,
        primaryMetricValue: l.displayValue,
      });
    }
  }

  const teamPairs: Array<{ id: string; name: string; abbrev: string }> = [];
  for (const m of matches.slice(0, 4)) {
    teamPairs.push({ id: m.home.id, name: m.home.name, abbrev: m.home.abbreviation });
    teamPairs.push({ id: m.away.id, name: m.away.name, abbrev: m.away.abbreviation });
  }

  const rosters = await Promise.all(
    teamPairs.slice(0, 6).map((t) => fetchTeamRosterPlayers(cfg, t.id, t.name, t.abbrev))
  );
  for (const roster of rosters) {
    for (const p of roster) {
      if (!p.playerId || seenIds.has(p.playerId)) continue;
      seenIds.add(p.playerId);
      collected.push(p);
    }
  }

  return setCached(cacheKey, collected.slice(0, 48), 120_000);
}

export async function getPlayerDetail(sport: SportKey, league: string, playerId: string): Promise<PlayerDetailPayload> {
  if (playerId.startsWith('rapid_')) {
    return getRapidPlayerDetail(sport, league, playerId.replace(/^rapid_/, ''));
  }

  const cfg = getLeagueConfig(sport, league);
  const cacheKey = `playerDetail:${cfg.sport}:${playerId}`;
  const cached = getCached<PlayerDetailPayload>(cacheKey);
  if (cached) return cached;

  const [overviewData, bioData] = await Promise.all([
    fetchJsonWithTimeout(`https://site.web.api.espn.com/apis/common/v3/sports/${cfg.espnSportPath}/athletes/${playerId}/overview`).catch(() => ({})),
    fetchJsonWithTimeout(`https://site.web.api.espn.com/apis/common/v3/sports/${cfg.espnSportPath}/athletes/${playerId}`).catch(() => ({})),
  ]);

  const athlete = bioData?.athlete || {};
  const statsObj = overviewData?.statistics || {};
  const statLabels: string[] = statsObj?.displayNames || statsObj?.labels || statsObj?.names || [];
  const splits: any[] = statsObj?.splits || [];
  const regularSplit = splits.find((s) => /regular|season|202/i.test(s?.displayName || '')) || splits[0];
  const splitValues: string[] = regularSplit?.stats || [];

  const seasonSummary = statLabels
    .map((lbl, idx) => ({
      label: lbl,
      value: splitValues[idx] !== undefined ? String(splitValues[idx]) : '-',
    }))
    .slice(0, 12);

  const gl = overviewData?.gameLog || {};
  const glStatsBlock = gl?.statistics?.[0] || {};
  const glLabels: string[] = glStatsBlock?.labels || statsObj?.labels || [];
  const glEventsMap = gl?.events || {};
  const glEntries: any[] = glStatsBlock?.events || [];

  const recentGames = glEntries.slice(0, 8).map((entry) => {
    const evMeta = glEventsMap[String(entry.eventId)] || {};
    const vals: string[] = entry.stats || [];
    const statRecord: Record<string, string> = {};
    glLabels.forEach((lbl, idx) => {
      if (vals[idx] !== undefined) statRecord[lbl] = String(vals[idx]);
    });
    return {
      date: evMeta.gameDate ? new Date(evMeta.gameDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '-',
      opponent: evMeta.opponent?.abbreviation || evMeta.opponent?.displayName || 'Rival',
      result: evMeta.gameResult ? `${evMeta.gameResult} ${evMeta.score || ''}`.trim() : evMeta.score || '-',
      stats: statRecord,
    };
  });

  const latestNews = ((overviewData?.news || []) as any[]).slice(0, 4).map((n) => ({
    headline: n.headline || n.title || '',
    published: n.published ? new Date(n.published).toLocaleDateString('es-ES') : '',
  }));

  const payload: PlayerDetailPayload = {
    playerId,
    sport: cfg.sport,
    league: cfg.id,
    name: athlete.displayName || athlete.fullName || 'Jugador',
    teamName: athlete.team?.displayName || 'Equipo',
    teamAbbrev: athlete.team?.abbreviation || '',
    teamLogo: athlete.team?.logos?.[0]?.href || undefined,
    position: athlete.position?.displayName || athlete.position?.abbreviation || 'Jugador',
    jersey: athlete.jersey ? String(athlete.jersey) : undefined,
    headshot: athlete.headshot?.href || undefined,
    age: athlete.age ? `${athlete.age} años` : undefined,
    heightWeight:
      athlete.displayHeight && athlete.displayWeight
        ? `${athlete.displayHeight} · ${athlete.displayWeight}`
        : undefined,
    seasonSummary,
    recentGames,
    statColumns: glLabels.slice(0, 7),
    latestNews,
  };

  return setCached(cacheKey, payload, 180_000);
}

// Real-Time SSE Score Diff Monitor
type SseListener = (event: LiveStreamEvent) => void;
const listeners = new Set<SseListener>();
const lastSnapshot = new Map<string, { homeScore: string; awayScore: string; state: 'pre' | 'in' | 'post' }>();
let monitorTimer: ReturnType<typeof setInterval> | null = null;

async function pollLiveChanges(): Promise<void> {
  if (listeners.size === 0) return;

  const sources: Promise<MatchSummaryCard[]>[] = [
    getScoreboard('basketball', 'nba'),
    getScoreboard('soccer', 'esp.1'),
    getScoreboard('soccer', 'eng.1'),
    getScoreboard('hockey', 'nhl'),
    getScoreboard('football', 'nfl'),
  ];

  if (isRapidApiConfigured()) {
    sources.push(getRapidLiveMatches('soccer'), getRapidLiveMatches('basketball'));
  }

  const results = await Promise.allSettled(sources);
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const m of res.value) {
      const homeScore = m.home.score ?? '0';
      const awayScore = m.away.score ?? '0';
      const prev = lastSnapshot.get(m.id);
      if (prev) {
        if (prev.state === 'pre' && m.statusState === 'in') {
          broadcast({
            type: 'kickoff',
            eventId: m.id,
            sport: m.sport,
            league: m.league,
            title: `Inicio · ${m.leagueName}`,
            message: `${m.away.shortName} vs ${m.home.shortName} ha comenzado.`,
            timestamp: new Date().toISOString(),
          });
        } else if (prev.state !== 'post' && m.statusState === 'post') {
          broadcast({
            type: 'final',
            eventId: m.id,
            sport: m.sport,
            league: m.league,
            title: `Resultado final · ${m.leagueName}`,
            message: `${m.away.shortName} ${awayScore} - ${homeScore} ${m.home.shortName}`,
            timestamp: new Date().toISOString(),
          });
        } else if (
          m.statusState === 'in' &&
          (prev.homeScore !== homeScore || prev.awayScore !== awayScore)
        ) {
          broadcast({
            type: 'score_update',
            eventId: m.id,
            sport: m.sport,
            league: m.league,
            title: `Marcador en vivo · ${m.leagueName}`,
            message: `${m.away.shortName} ${awayScore} - ${homeScore} ${m.home.shortName} (${m.statusDetail})`,
            timestamp: new Date().toISOString(),
          });
        }
      }
      lastSnapshot.set(m.id, { homeScore, awayScore, state: m.statusState });
    }
  }
}

function broadcast(ev: LiveStreamEvent): void {
  for (const listener of listeners) {
    listener(ev);
  }
}

export function subscribeToLiveUpdates(listener: SseListener): () => void {
  listeners.add(listener);
  if (!monitorTimer) {
    void pollLiveChanges();
    monitorTimer = setInterval(() => {
      void pollLiveChanges();
    }, 25_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  };
}
