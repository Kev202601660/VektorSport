import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BrainCircuit, RefreshCw, Search, Star, X } from 'lucide-react';
import type { LeagueConfig, LiveStreamEvent, MatchSummaryCard, SportKey } from './types/sports.ts';
import { FirebaseProvider, useFirebaseSync } from './contexts/FirebaseContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Header, type NavSection } from './components/Header.tsx';
import { MobileBottomNav } from './components/MobileBottomNav.tsx';
import { MatchCard } from './components/MatchCard.tsx';
import { MatchDetailDrawer } from './components/MatchDetailDrawer.tsx';
import { PlayersExplorer } from './components/PlayersExplorer.tsx';
import { FavoritesView } from './components/FavoritesView.tsx';
import { PredictionsView } from './components/PredictionsView.tsx';
import { AlertsDrawer } from './components/AlertsDrawer.tsx';
import { TeamLogo } from './components/TeamLogo.tsx';
import { SPORT_TABS } from './utils/formatters.ts';

function VektorSportShell() {
  const {
    followedLeagues,
    favoriteTeams,
    savedPredictions,
    alerts,
    notificationsEnabled,
    addAlertEvent,
    authError,
    clearAuthError,
  } = useFirebaseSync();

  const [section, setSection] = useState<NavSection>('live');
  const [leagues, setLeagues] = useState<LeagueConfig[]>([]);
  const [matches, setMatches] = useState<MatchSummaryCard[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sportFilter, setSportFilter] = useState<SportKey | 'all'>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'pre' | 'post'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMatch, setSelectedMatch] = useState<MatchSummaryCard | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [liveToast, setLiveToast] = useState<LiveStreamEvent | null>(null);

  // Load league catalog
  useEffect(() => {
    fetch('/api/sports/leagues')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.leagues)) {
          setLeagues(data.leagues);
        }
      })
      .catch(() => undefined);
  }, []);

  // Load scoreboards for followed leagues (or active specific league)
  const fetchScoreboards = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingMatches(true);
      else setRefreshing(true);

      try {
        const targetLeagues =
          leagueFilter !== 'all'
            ? [leagueFilter]
            : sportFilter !== 'all'
              ? leagues.filter((l) => l.sport === sportFilter).map((l) => l.id)
              : followedLeagues;

        const queryParam =
          targetLeagues.length > 0 ? targetLeagues.join(',') : 'esp.1,eng.1,nba,nhl,nfl';

        const res = await fetch(
          `/api/sports/scoreboard?leagues=${encodeURIComponent(queryParam)}`
        );
        const data = await res.json();
        if (Array.isArray(data.matches)) {
          setMatches(data.matches);
        }
      } catch {
        // retain current list on transient failure
      } finally {
        setLoadingMatches(false);
        setRefreshing(false);
      }
    },
    [followedLeagues, leagueFilter, leagues, sportFilter]
  );

  useEffect(() => {
    void fetchScoreboards(false);
    const interval = setInterval(() => {
      void fetchScoreboards(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchScoreboards]);

  // Real-time SSE score & result notifications
  useEffect(() => {
    const es = new EventSource('/api/sports/stream');
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as LiveStreamEvent;
        if (parsed.type === 'connected') {
          setSseConnected(true);
          return;
        }
        setLiveToast(parsed);
        void fetchScoreboards(true);

        if (parsed.eventId && parsed.sport) {
          void addAlertEvent({
            eventId: parsed.eventId,
            sport: parsed.sport,
            title: parsed.title,
            message: parsed.message,
            alertType:
              parsed.type === 'final'
                ? 'final'
                : parsed.type === 'kickoff'
                  ? 'kickoff'
                  : 'score',
          });
        }

        if (
          notificationsEnabled &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(parsed.title, { body: parsed.message });
        }
      } catch {
        // ignore malformed SSE chunk
      }
    };
    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [addAlertEvent, fetchScoreboards, notificationsEnabled]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => setLiveToast(null), 6000);
    return () => clearTimeout(timer);
  }, [liveToast]);

  const visibleLeagues = useMemo(() => {
    if (sportFilter === 'all') {
      return leagues.filter((l) => followedLeagues.includes(l.id));
    }
    return leagues.filter((l) => l.sport === sportFilter);
  }, [followedLeagues, leagues, sportFilter]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (sportFilter !== 'all' && m.sport !== sportFilter) return false;
      if (leagueFilter !== 'all' && m.league !== leagueFilter) return false;
      if (statusFilter !== 'all' && m.statusState !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${m.home.name} ${m.away.name} ${m.leagueName} ${m.venue || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leagueFilter, matches, searchQuery, sportFilter, statusFilter]);

  const liveCount = useMemo(
    () => matches.filter((m) => m.statusState === 'in').length,
    [matches]
  );

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F1F5F9] flex flex-col pb-16 md:pb-8">
      <Header
        activeSection={section}
        onSelectSection={(sec) => {
          setAlertsOpen(false);
          setSection(sec);
        }}
        onOpenAlerts={() => setAlertsOpen(true)}
        unreadAlertsCount={unreadAlertsCount}
      />

      {authError && (
        <div className="max-w-7xl mx-auto w-full px-4 md:px-6 pt-3">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              aria-label="Cerrar aviso de inicio de sesión"
              className="p-1 text-amber-300/80 hover:text-amber-100 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 pt-5 md:pt-7">
        {section === 'live' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Sports & Predictions Feed */}
            <div className="lg:col-span-8 space-y-5">
              {/* Editorial Header & Search */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
                    Marcadores y predicciones en vivo
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {liveCount > 0
                      ? `${liveCount} encuentros en juego ahora mismo · Análisis predictivo IA disponible`
                      : 'Datos en tiempo real de fútbol, baloncesto, hockey y fútbol americano'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar equipo..."
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-[#11141A] border border-white/[0.08] text-xs md:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchScoreboards(true)}
                    aria-label="Actualizar marcadores"
                    className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-[#11141A] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#161A22] transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Sport Segmented Filter */}
              <div className="flex items-center gap-1 p-1 bg-[#11141A] border border-white/[0.08] rounded-xl overflow-x-auto no-scrollbar">
                {SPORT_TABS.map((tab) => {
                  const active = sportFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setSportFilter(tab.id);
                        setLeagueFilter('all');
                      }}
                      className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        active ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* League & Status Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => setLeagueFilter('all')}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      leagueFilter === 'all'
                        ? 'bg-[#1A202C] border-emerald-500/50 text-white'
                        : 'bg-[#11141A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todas las ligas
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeagueFilter('rapid_live')}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      leagueFilter === 'rapid_live'
                        ? 'bg-[#1A202C] border-emerald-500/50 text-emerald-300'
                        : 'bg-[#11141A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    En vivo global
                  </button>
                  {visibleLeagues.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLeagueFilter(l.id)}
                      className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        leagueFilter === l.id
                          ? 'bg-[#1A202C] border-emerald-500/50 text-white'
                          : 'bg-[#11141A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {l.shortName}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#11141A] border border-white/[0.08] rounded-xl self-start shrink-0">
                  {[
                    { id: 'all' as const, label: 'Todos' },
                    { id: 'in' as const, label: 'En vivo' },
                    { id: 'pre' as const, label: 'Próximos' },
                    { id: 'post' as const, label: 'Finales' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id)}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        statusFilter === st.id
                          ? 'bg-[#222834] text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Match Grid */}
              {loadingMatches ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="h-40 rounded-2xl bg-[#11141A] border border-white/[0.08]"
                    />
                  ))}
                </div>
              ) : filteredMatches.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredMatches.map((match) => (
                    <MatchCard
                      key={`${match.league}_${match.id}`}
                      match={match}
                      onSelect={(m) => setSelectedMatch(m)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
                  <p className="text-sm text-slate-300">
                    No hay partidos que coincidan con los filtros seleccionados en este momento.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSportFilter('all');
                      setLeagueFilter('all');
                      setStatusFilter('all');
                      setSearchQuery('');
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1A1F28] text-xs font-semibold text-white hover:bg-[#232A36] transition-colors"
                  >
                    Restablecer filtros
                  </button>
                </div>
              )}
            </div>

            {/* Right Desktop Analytical Rail */}
            <aside className="hidden lg:block lg:col-span-4 space-y-5 sticky top-20">
              {/* Favorite Teams Rail */}
              <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400" />
                    Equipos favoritos
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('favorites')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Gestionar
                  </button>
                </div>

                {favoriteTeams.length > 0 ? (
                  <div className="divide-y divide-white/[0.06]">
                    {favoriteTeams.slice(0, 5).map((team) => (
                      <div
                        key={team.teamKey}
                        className="py-2.5 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <TeamLogo
                            src={team.logo}
                            alt={team.name}
                            abbrev={team.abbreviation}
                            size="sm"
                          />
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {team.shortName}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 shrink-0">
                          {team.leagueName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Marca la estrella en cualquier equipo para seguir sus marcadores y estadísticas al instante.
                  </p>
                )}
              </div>

              {/* Saved AI Picks Rail */}
              <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-emerald-400" />
                    Últimos IA Picks
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('predictions')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Ver todos
                  </button>
                </div>

                {savedPredictions.length > 0 ? (
                  <div className="divide-y divide-white/[0.06]">
                    {savedPredictions.slice(0, 4).map((p) => (
                      <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {p.selection}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{p.matchTitle}</div>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-semibold text-emerald-400 shrink-0">
                          {p.confidence}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Selecciona un encuentro para generar un análisis predictivo basado en tendencias históricas.
                  </p>
                )}
              </div>

              {/* Live Alerts Summary */}
              <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-slate-300" />
                    Alertas en tiempo real
                  </h2>
                  <button
                    type="button"
                    onClick={() => setAlertsOpen(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Configurar
                  </button>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {sseConnected
                    ? 'Canal en vivo conectado para detectar goles, canastas, touchdowns y resultados finales.'
                    : 'Estableciendo conexión de actualizaciones en vivo...'}
                </p>
              </div>
            </aside>
          </div>
        )}

        {section === 'favorites' && (
          <FavoritesView
            leagues={leagues}
            allMatches={matches}
            onSelectMatch={(m) => setSelectedMatch(m)}
          />
        )}

        {section === 'predictions' && (
          <PredictionsView onNavigateLive={() => setSection('live')} />
        )}

        {section === 'players' && <PlayersExplorer leagues={leagues} />}
      </main>

      {/* Real-time Live Score Toast */}
      {liveToast && (
        <div className="fixed bottom-16 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-40 bg-[#161A22] border border-emerald-500/40 rounded-2xl p-4 shadow-xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-emerald-400">{liveToast.title}</div>
            <div className="text-sm text-white mt-0.5">{liveToast.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            aria-label="Cerrar aviso"
            className="p-1 text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <MobileBottomNav
        activeSection={section}
        alertsOpen={alertsOpen}
        unreadAlertsCount={unreadAlertsCount}
        onSelectSection={(sec) => {
          setAlertsOpen(false);
          setSection(sec);
        }}
        onOpenAlerts={() => setAlertsOpen(true)}
      />

      {selectedMatch && (
        <MatchDetailDrawer match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}

      <AlertsDrawer
        open={alertsOpen}
        sseConnected={sseConnected}
        onClose={() => setAlertsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <VektorSportShell />
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
