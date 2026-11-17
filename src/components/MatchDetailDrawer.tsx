import React, { useEffect, useState } from 'react';
import { BookmarkCheck, BookmarkPlus, BrainCircuit, ChevronRight, ShieldAlert, Star, X } from 'lucide-react';
import type {
  AiPredictionResult,
  MatchDetailPayload,
  MatchSummaryCard,
  PlayerStatLine,
} from '../types/sports.ts';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';
import { formatKickoff, formatMoneyline } from '../utils/formatters.ts';
import { PlayerAvatar, TeamLogo } from './TeamLogo.tsx';
import { PlayerDetailModal } from './PlayerDetailModal.tsx';
import { WinProbabilityChart } from './WinProbabilityChart.tsx';

interface MatchDetailDrawerProps {
  match: MatchSummaryCard;
  onClose: () => void;
}

type DetailTab = 'ai' | 'players' | 'stats';

export const MatchDetailDrawer: React.FC<MatchDetailDrawerProps> = ({ match, onClose }) => {
  const { oddsFormat, isFavoriteTeam, toggleFavoriteTeam, savePrediction, savedPredictions } =
    useFirebaseSync();

  const [tab, setTab] = useState<DetailTab>('ai');
  const [detail, setDetail] = useState<MatchDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [aiResult, setAiResult] = useState<AiPredictionResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<'all' | 'away' | 'home'>('all');
  const [activePlayer, setActivePlayer] = useState<PlayerStatLine | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingDetail(true);
    setDetailError(null);
    setAiResult(null);
    setAiError(null);
    setSavedNotice(false);

    fetch(`/api/sports/match/${match.sport}/${match.league}/${match.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'No se pudo cargar el detalle del partido.');
        }
        return res.json() as Promise<MatchDetailPayload>;
      })
      .then((payload) => {
        if (active) setDetail(payload);
      })
      .catch((err) => {
        if (active) setDetailError(err instanceof Error ? err.message : 'Error de conexión.');
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [match.id, match.league, match.sport]);

  const handleGenerateAi = async () => {
    setLoadingAi(true);
    setAiError(null);
    setSavedNotice(false);
    try {
      const res = await fetch('/api/ai/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: match.sport,
          league: match.league,
          eventId: match.id,
          oddsFormat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar el análisis predictivo.');
      }
      setAiResult(data.prediction as AiPredictionResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al consultar el motor IA.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSavePrediction = async () => {
    if (!aiResult) return;
    await savePrediction(aiResult);
    setSavedNotice(true);
  };

  const liveMatch = detail?.match || match;
  const isLive = liveMatch.statusState === 'in';
  const isPost = liveMatch.statusState === 'post';
  const alreadySaved = savedPredictions.some((p) => p.eventId === liveMatch.id);

  const awayFav = isFavoriteTeam(liveMatch.sport, liveMatch.league, liveMatch.away.id);
  const homeFav = isFavoriteTeam(liveMatch.sport, liveMatch.league, liveMatch.home.id);

  const playerList: PlayerStatLine[] = detail
    ? selectedTeamFilter === 'away'
      ? detail.awayPlayers
      : selectedTeamFilter === 'home'
        ? detail.homePlayers
        : [...detail.awayPlayers, ...detail.homePlayers]
    : [];

  return (
    <div
      className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end md:items-center justify-end"
      onClick={onClose}
    >
      <aside
        aria-label="Detalle del encuentro"
        className="w-full md:max-w-2xl h-[92vh] md:h-full bg-[#0D1015] border-t md:border-t-0 md:border-l border-white/[0.08] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header & Scoreboard Summary */}
        <div className="px-5 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-xs text-slate-400 truncate">
              <span className="font-medium text-slate-200">{liveMatch.leagueName}</span>
              <span aria-hidden="true"> · </span>
              <span className={isLive ? 'text-emerald-400 font-medium' : ''}>
                {isLive ? `En vivo · ${liveMatch.statusDetail}` : isPost ? liveMatch.statusDetail : formatKickoff(liveMatch.date)}
              </span>
              {detail?.rapidApiEnriched && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="text-slate-400">RapidAPI + Live Feed</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle del partido"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* Away */}
            <div className="flex items-center gap-3 min-w-0">
              <TeamLogo src={liveMatch.away.logo} alt={liveMatch.away.name} abbrev={liveMatch.away.abbreviation} size="lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm md:text-base font-bold text-white truncate">
                    {liveMatch.away.shortName}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleFavoriteTeam({
                        team: liveMatch.away,
                        sport: liveMatch.sport,
                        league: liveMatch.league,
                        leagueName: liveMatch.leagueName,
                      })
                    }
                    aria-label="Favorito visitante"
                    className={`p-1 rounded ${awayFav ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${awayFav ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-400">
                  {liveMatch.away.record || 'Visitante'}
                </div>
              </div>
            </div>

            {/* Score / VS */}
            <div className="text-center px-2">
              {isLive || isPost ? (
                <div className="font-mono tabular-nums text-2xl md:text-3xl font-bold text-white tracking-tight">
                  {liveMatch.away.score ?? '0'} <span className="text-slate-600">:</span> {liveMatch.home.score ?? '0'}
                </div>
              ) : (
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">VS</div>
              )}
              {liveMatch.odds && (
                <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                  {formatMoneyline(liveMatch.odds.awayMoneyline, oddsFormat)} /{' '}
                  {formatMoneyline(liveMatch.odds.homeMoneyline, oddsFormat)}
                </div>
              )}
            </div>

            {/* Home */}
            <div className="flex items-center justify-end gap-3 min-w-0 text-right">
              <div className="min-w-0">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void toggleFavoriteTeam({
                        team: liveMatch.home,
                        sport: liveMatch.sport,
                        league: liveMatch.league,
                        leagueName: liveMatch.leagueName,
                      })
                    }
                    aria-label="Favorito local"
                    className={`p-1 rounded ${homeFav ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${homeFav ? 'fill-amber-400' : ''}`} />
                  </button>
                  <span className="text-sm md:text-base font-bold text-white truncate">
                    {liveMatch.home.shortName}
                  </span>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-400">
                  {liveMatch.home.record || 'Local'}
                </div>
              </div>
              <TeamLogo src={liveMatch.home.logo} alt={liveMatch.home.name} abbrev={liveMatch.home.abbreviation} size="lg" />
            </div>
          </div>

          {/* Segmented Section Switcher */}
          <div className="mt-4 grid grid-cols-3 gap-1 p-1 bg-[#161A22] rounded-xl border border-white/[0.06]">
            {[
              { id: 'ai' as const, label: 'Análisis IA' },
              { id: 'players' as const, label: 'Jugadores' },
              { id: 'stats' as const, label: 'Estadísticas' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-[#222834] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loadingDetail && (
            <div className="space-y-3 animate-pulse">
              <div className="h-24 rounded-xl bg-white/[0.04]" />
              <div className="h-44 rounded-xl bg-white/[0.04]" />
            </div>
          )}

          {detailError && !loadingDetail && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              {detailError}
            </div>
          )}

          {!loadingDetail && !detailError && tab === 'ai' && (
            <div className="space-y-5">
              {/* Win Probability Evolution Line Chart */}
              {detail?.winProbTimeline && detail.winProbTimeline.points.length > 0 && (
                <WinProbabilityChart
                  points={detail.winProbTimeline.points}
                  mode={detail.winProbTimeline.mode}
                  homeAbbrev={liveMatch.home.abbreviation}
                  awayAbbrev={liveMatch.away.abbreviation}
                />
              )}

              {/* Statistical Baseline Predictor if available */}
              {detail?.predictor && (
                <div className="bg-[#11141A] border border-white/[0.08] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Proyección estadística previa</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {liveMatch.away.abbreviation} {detail.predictor.awayWinPct}% · {liveMatch.home.abbreviation}{' '}
                      {detail.predictor.homeWinPct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
                    <div
                      className="bg-slate-400 h-full"
                      style={{ width: `${detail.predictor.awayWinPct}%` }}
                    />
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${detail.predictor.homeWinPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* AI Action Trigger */}
              {!aiResult && (
                <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="font-display text-base font-semibold text-white">
                      Sistema predictivo basado en IA y tendencias históricas
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Evalúa racha de últimos 5 encuentros, bajas médicas, métricas de jugadores clave y líneas de mercado para emitir una recomendación fundamentada.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerateAi()}
                    disabled={loadingAi}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-60 transition-colors"
                  >
                    <BrainCircuit className="w-4 h-4" />
                    {loadingAi ? 'Analizando tendencias históricas...' : 'Generar predicción IA'}
                  </button>
                  {aiError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                      {aiError}
                    </div>
                  )}
                </div>
              )}

              {/* AI Output */}
              {aiResult && (
                <div className="space-y-5">
                  <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400">
                          {aiResult.recommendedPick.market} · Valor {aiResult.recommendedPick.edgeRating}
                        </div>
                        <h3 className="font-display text-xl font-bold text-white mt-0.5">
                          {aiResult.recommendedPick.selection}
                        </h3>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-400">Confianza</div>
                        <div className="font-mono tabular-nums text-xl font-bold text-emerald-400">
                          {aiResult.recommendedPick.confidence}%
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-2 border-t border-white/[0.06]">
                      <span>
                        Stake sugerido:{' '}
                        <strong className="font-mono tabular-nums text-white">
                          {aiResult.recommendedPick.suggestedUnits}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400">{aiResult.recommendedPick.oddsContext}</span>
                    </div>

                    {/* Probability Split */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-300">
                        <span>
                          {liveMatch.away.abbreviation} {aiResult.winProbability.away}%
                        </span>
                        {aiResult.winProbability.draw > 0 && (
                          <span className="text-slate-400">Empate {aiResult.winProbability.draw}%</span>
                        )}
                        <span className="text-emerald-400">
                          {liveMatch.home.abbreviation} {aiResult.winProbability.home}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
                        <div className="bg-slate-400" style={{ width: `${aiResult.winProbability.away}%` }} />
                        {aiResult.winProbability.draw > 0 && (
                          <div className="bg-amber-500/80" style={{ width: `${aiResult.winProbability.draw}%` }} />
                        )}
                        <div className="bg-emerald-500" style={{ width: `${aiResult.winProbability.home}%` }} />
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">{aiResult.summary}</p>

                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleSavePrediction()}
                        disabled={savedNotice || alreadySaved}
                        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 disabled:opacity-60 transition-colors"
                      >
                        {savedNotice || alreadySaved ? (
                          <>
                            <BookmarkCheck className="w-4 h-4" />
                            Guardada en tu historial
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-4 h-4" />
                            Guardar recomendación
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerateAi()}
                        disabled={loadingAi}
                        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-[#161A22] border border-white/[0.08] text-xs font-medium text-slate-200 hover:bg-[#1E232E] transition-colors"
                      >
                        Recalcular
                      </button>
                    </div>
                  </div>

                  {/* Historical Trends */}
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-semibold text-white">Tendencias históricas detectadas</h4>
                    <ul className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-xl">
                      {aiResult.historicalTrends.map((trend, i) => (
                        <li key={i} className="p-3.5 text-sm text-slate-300 leading-relaxed">
                          {trend}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Alternative Markets */}
                  {aiResult.alternativePicks.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="text-sm font-semibold text-white">Mercados alternativos con valor</h4>
                      <div className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-xl">
                        {aiResult.alternativePicks.map((alt, i) => (
                          <div key={i} className="p-3.5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-white">
                                {alt.market}: {alt.selection}
                              </span>
                              <span className="font-mono tabular-nums text-xs text-emerald-400 shrink-0">
                                {alt.confidence}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">{alt.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Factors & Risk */}
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-semibold text-white">Factores clave y riesgo</h4>
                    <div className="bg-[#11141A] border border-white/[0.08] rounded-xl p-4 space-y-3">
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {aiResult.keyFactors.map((f, i) => (
                          <li key={i}>• {f}</li>
                        ))}
                      </ul>
                      <div className="pt-2.5 border-t border-white/[0.06] flex items-start gap-2 text-xs text-amber-300/90">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{aiResult.riskAssessment}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loadingDetail && !detailError && tab === 'players' && detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 p-1 bg-[#161A22] rounded-xl border border-white/[0.06]">
                {[
                  { id: 'all' as const, label: 'Todos' },
                  { id: 'away' as const, label: liveMatch.away.shortName },
                  { id: 'home' as const, label: liveMatch.home.shortName },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedTeamFilter(f.id)}
                    className={`flex-1 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg truncate transition-colors ${
                      selectedTeamFilter === f.id
                        ? 'bg-[#222834] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {playerList.length > 0 ? (
                <div className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-xl overflow-hidden">
                  {playerList.map((p) => {
                    const statPairs = Object.entries(p.stats).slice(0, 4);
                    return (
                      <button
                        key={p.teamId + '_' + p.playerId}
                        type="button"
                        onClick={() => setActivePlayer(p)}
                        className="w-full text-left p-3.5 hover:bg-white/[0.03] transition-colors flex items-center justify-between gap-3 min-h-[60px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar src={p.headshot} alt={p.name} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                            <div className="text-xs text-slate-400 truncate">
                              {p.teamAbbrev} · {p.position}
                              {p.jersey ? ` · #${p.jersey}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {statPairs.length > 0 ? (
                            <div className="hidden sm:flex items-center gap-3">
                              {statPairs.map(([k, v]) => (
                                <div key={k} className="text-right">
                                  <div className="text-[10px] text-slate-500 font-mono">{k}</div>
                                  <div className="text-xs font-mono tabular-nums font-semibold text-slate-200">
                                    {v}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="text-right">
                            <div className="text-[10px] text-slate-500 font-mono">{p.primaryMetricLabel}</div>
                            <div className="text-sm font-mono tabular-nums font-bold text-emerald-400">
                              {p.primaryMetricValue}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-5 text-sm text-slate-400 bg-[#11141A] border border-white/[0.08] rounded-xl">
                  Plantillas y estadísticas individuales aún no publicadas para este evento.
                </div>
              )}
            </div>
          )}

          {!loadingDetail && !detailError && tab === 'stats' && detail && (
            <div className="space-y-6">
              {/* Last 5 Form */}
              {(detail.awayLastFive.length > 0 || detail.homeLastFive.length > 0) && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-white">Racha reciente (Últimos 5 partidos)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: liveMatch.away.shortName, games: detail.awayLastFive },
                      { label: liveMatch.home.shortName, games: detail.homeLastFive },
                    ].map((side) => (
                      <div
                        key={side.label}
                        className="bg-[#11141A] border border-white/[0.08] rounded-xl p-3.5 space-y-2"
                      >
                        <div className="text-xs font-semibold text-slate-200">{side.label}</div>
                        <div className="space-y-1.5">
                          {side.games.map((g, idx) => (
                            <div
                              key={g.id || idx}
                              className="flex items-center justify-between text-xs gap-2"
                            >
                              <span className="text-slate-400 truncate">
                                {g.homeAway} {g.opponent}
                              </span>
                              <span className="font-mono tabular-nums shrink-0">
                                <span
                                  className={
                                    g.result === 'W'
                                      ? 'text-emerald-400 font-semibold'
                                      : g.result === 'L'
                                        ? 'text-red-400 font-semibold'
                                        : 'text-slate-300'
                                  }
                                >
                                  {g.result}
                                </span>{' '}
                                <span className="text-slate-300">{g.score}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team Stats Comparison */}
              {detail.teamStats.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-white">Comparativa estadística</h4>
                  <div className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-xl">
                    {detail.teamStats.slice(0, 12).map((st) => (
                      <div key={st.name} className="px-4 py-2.5 grid grid-cols-3 items-center text-xs">
                        <span className="font-mono tabular-nums font-semibold text-white">
                          {st.awayValue}
                        </span>
                        <span className="text-center text-slate-400 truncate">{st.label}</span>
                        <span className="font-mono tabular-nums font-semibold text-white text-right">
                          {st.homeValue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Injuries */}
              {detail.injuries.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-white">Parte médico y bajas</h4>
                  <div className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-xl">
                    {detail.injuries.map((inj, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <span className="text-white font-medium">{inj.playerName}</span>{' '}
                          <span className="text-slate-400">
                            ({inj.teamAbbrev} · {inj.position})
                          </span>
                          {inj.detail && <div className="text-slate-500 truncate">{inj.detail}</div>}
                        </div>
                        <span className="text-amber-400 font-medium shrink-0">{inj.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Standings Snapshot */}
              {detail.standings.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-white">Clasificación ({liveMatch.leagueName})</h4>
                  <div className="overflow-x-auto bg-[#11141A] border border-white/[0.08] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-slate-400">
                          <th className="py-2.5 px-3 font-medium">#</th>
                          <th className="py-2.5 px-3 font-medium">Equipo</th>
                          <th className="py-2.5 px-3 font-medium text-right font-mono">PJ</th>
                          <th className="py-2.5 px-3 font-medium text-right font-mono">G</th>
                          <th className="py-2.5 px-3 font-medium text-right font-mono">P</th>
                          <th className="py-2.5 px-3 font-medium text-right font-mono">PTS/PCT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {detail.standings.slice(0, 12).map((row) => {
                          const isMatchTeam =
                            row.teamId === liveMatch.home.id || row.teamId === liveMatch.away.id;
                          return (
                            <tr
                              key={row.teamId + row.rank}
                              className={isMatchTeam ? 'bg-emerald-500/10' : ''}
                            >
                              <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400">
                                {row.rank}
                              </td>
                              <td className="py-2.5 px-3 text-white font-medium truncate max-w-[160px]">
                                {row.teamName}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                                {row.played}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                                {row.wins}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                                {row.losses}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-white">
                                {row.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {activePlayer && (
        <PlayerDetailModal
          playerId={activePlayer.playerId}
          sport={activePlayer.sport}
          league={activePlayer.league}
          initialName={activePlayer.name}
          onClose={() => setActivePlayer(null)}
        />
      )}
    </div>
  );
};
