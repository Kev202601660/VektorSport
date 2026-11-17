export type SportKey = 'soccer' | 'basketball' | 'hockey' | 'football';

export interface LeagueConfig {
  id: string;
  sport: SportKey;
  sportLabel: string;
  name: string;
  shortName: string;
  country: string;
  espnSportPath: string;
}

export interface TeamBrief {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo: string;
  color?: string;
  score?: string;
  record?: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
  form?: string;
}

export interface MatchOdds {
  provider: string;
  details: string;
  overUnder?: number;
  spread?: number;
  homeMoneyline?: string;
  awayMoneyline?: string;
  drawMoneyline?: string;
}

export interface MatchLeader {
  category: string;
  playerId: string;
  playerName: string;
  headshot?: string;
  position?: string;
  teamId: string;
  teamAbbrev: string;
  displayValue: string;
}

export interface MatchSummaryCard {
  id: string;
  sport: SportKey;
  league: string;
  leagueName: string;
  name: string;
  shortName: string;
  date: string;
  statusState: 'pre' | 'in' | 'post';
  statusDetail: string;
  statusShortDetail: string;
  clock?: string;
  period?: number;
  venue?: string;
  broadcast?: string;
  home: TeamBrief;
  away: TeamBrief;
  odds?: MatchOdds;
  leaders: MatchLeader[];
  source: 'espn' | 'sofascore' | 'espn+rapidapi';
}

export interface PlayerStatLine {
  playerId: string;
  name: string;
  shortName: string;
  headshot?: string;
  jersey?: string;
  position: string;
  teamId: string;
  teamName: string;
  teamAbbrev: string;
  sport: SportKey;
  league: string;
  starter?: boolean;
  stats: Record<string, string>;
  primaryMetricLabel: string;
  primaryMetricValue: string;
}

export interface TeamLastGame {
  id: string;
  date: string;
  opponent: string;
  opponentLogo?: string;
  score: string;
  result: 'W' | 'L' | 'D' | '-';
  homeAway: string;
}

export interface TeamStatItem {
  name: string;
  label: string;
  homeValue: string;
  awayValue: string;
}

export interface InjuryReport {
  playerName: string;
  position: string;
  status: string;
  detail: string;
  teamAbbrev: string;
}

export interface StandingEntry {
  teamId: string;
  teamName: string;
  teamAbbrev: string;
  logo?: string;
  rank: number;
  played: string;
  wins: string;
  losses: string;
  draws?: string;
  points?: string;
  diff?: string;
  streak?: string;
}

export interface WinProbPoint {
  label: string;
  homeProb: number;
  awayProb: number;
  drawProb?: number;
  context?: string;
}

export interface MatchDetailPayload {
  match: MatchSummaryCard;
  homePlayers: PlayerStatLine[];
  awayPlayers: PlayerStatLine[];
  teamStats: TeamStatItem[];
  homeLastFive: TeamLastGame[];
  awayLastFive: TeamLastGame[];
  injuries: InjuryReport[];
  standings: StandingEntry[];
  predictor?: {
    homeWinPct: number;
    awayWinPct: number;
    drawWinPct?: number;
  };
  winProbTimeline: {
    mode: 'live_plays' | 'historical_trend';
    points: WinProbPoint[];
  };
  rapidApiEnriched: boolean;
}

export interface PlayerDetailPayload {
  playerId: string;
  sport: SportKey;
  league: string;
  name: string;
  teamName: string;
  teamAbbrev: string;
  teamLogo?: string;
  position: string;
  jersey?: string;
  headshot?: string;
  age?: string;
  heightWeight?: string;
  seasonSummary: Array<{ label: string; value: string }>;
  recentGames: Array<{
    date: string;
    opponent: string;
    result: string;
    stats: Record<string, string>;
  }>;
  statColumns: string[];
  latestNews: Array<{ headline: string; published: string }>;
}

export interface AiPredictionRequest {
  sport: SportKey;
  league: string;
  eventId: string;
  oddsFormat: 'decimal' | 'american';
}

export interface AiPredictionResult {
  eventId: string;
  sport: SportKey;
  league: string;
  matchTitle: string;
  generatedAt: string;
  winProbability: {
    home: number;
    draw: number;
    away: number;
  };
  recommendedPick: {
    market: string;
    selection: string;
    confidence: number;
    edgeRating: 'Alto' | 'Moderado' | 'Especulativo';
    suggestedUnits: string;
    oddsContext: string;
  };
  alternativePicks: Array<{
    market: string;
    selection: string;
    confidence: number;
    rationale: string;
  }>;
  historicalTrends: string[];
  keyFactors: string[];
  riskAssessment: string;
  summary: string;
}

export interface LiveStreamEvent {
  type: 'connected' | 'score_update' | 'kickoff' | 'final';
  eventId?: string;
  sport?: SportKey;
  league?: string;
  title: string;
  message: string;
  timestamp: string;
}

export interface FavoriteTeamDoc {
  userId: string;
  teamKey: string;
  teamId: string;
  sport: SportKey;
  league: string;
  leagueName: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo: string;
  createdAt?: unknown;
}

export interface SavedPredictionDoc {
  id: string;
  userId: string;
  eventId: string;
  sport: SportKey;
  league: string;
  matchTitle: string;
  market: string;
  selection: string;
  confidence: number;
  edgeRating: 'Alto' | 'Moderado' | 'Especulativo';
  homeWinProb: number;
  awayWinProb: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AlertEventDoc {
  id: string;
  userId: string;
  eventId: string;
  sport: SportKey;
  title: string;
  message: string;
  alertType: 'score' | 'kickoff' | 'final' | 'ai_edge';
  read: boolean;
  createdAt?: unknown;
}

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  followedLeagues: string[];
  notificationsEnabled: boolean;
  oddsFormat: 'decimal' | 'american';
}
