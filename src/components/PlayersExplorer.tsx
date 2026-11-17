import React, { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { LeagueConfig, PlayerStatLine, SportKey } from '../types/sports.ts';
import { SPORT_TABS } from '../utils/formatters.ts';
import { PlayerAvatar } from './TeamLogo.tsx';
import { PlayerDetailModal } from './PlayerDetailModal.tsx';

interface PlayersExplorerProps {
  leagues: LeagueConfig[];
}

export const PlayersExplorer: React.FC<PlayersExplorerProps> = ({ leagues }) => {
  const [sport, setSport] = useState<SportKey>('basketball');
  const [leagueId, setLeagueId] = useState<string>('nba');
  const [players, setPlayers] = useState<PlayerStatLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStatLine | null>(null);

  const sportLeagues = leagues.filter((l) => l.sport === sport);

  useEffect(() => {
    const first = leagues.find((l) => l.sport === sport);
    if (first && !leagues.some((l) => l.sport === sport && l.id === leagueId)) {
      setLeagueId(first.id);
    }
  }, [sport, leagueId, leagues]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/sports/players/featured?sport=${sport}&league=${leagueId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) setPlayers(Array.isArray(data.players) ? data.players : []);
      })
      .catch(() => {
        if (active) setPlayers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sport, leagueId]);

  const filtered = players.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.teamName.toLowerCase().includes(q) ||
      p.teamAbbrev.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q)
    );
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
            Estadísticas avanzadas de jugadores
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Rendimiento individual, líderes por partido y registros históricos por competición.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar jugador o equipo..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-[#11141A] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Sport & League Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#11141A] border border-white/[0.08] rounded-xl overflow-x-auto no-scrollbar">
          {SPORT_TABS.filter((t) => t.id !== 'all').map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSport(t.id as SportKey)}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                sport === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {sportLeagues.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLeagueId(l.id)}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                leagueId === l.id
                  ? 'bg-[#1A202C] border-emerald-500/50 text-white'
                  : 'bg-[#11141A] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
            >
              {l.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Players Table / Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-20 rounded-xl bg-[#11141A] border border-white/[0.08]" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button
              key={p.playerId + '_' + p.teamId}
              type="button"
              onClick={() => setSelectedPlayer(p)}
              className="text-left bg-[#11141A] hover:bg-[#151922] border border-white/[0.08] rounded-2xl p-4 transition-colors flex items-center justify-between gap-3 min-h-[76px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar src={p.headshot} alt={p.name} size="md" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {p.teamAbbrev} · {p.position}
                    {p.jersey ? ` · #${p.jersey}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-500">{p.primaryMetricLabel}</div>
                  <div className="text-base font-mono tabular-nums font-bold text-emerald-400">
                    {p.primaryMetricValue}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-[#11141A] border border-white/[0.08] rounded-2xl text-sm text-slate-400">
          No se encontraron jugadores para esta búsqueda o competición en este momento.
        </div>
      )}

      {selectedPlayer && (
        <PlayerDetailModal
          playerId={selectedPlayer.playerId}
          sport={selectedPlayer.sport}
          league={selectedPlayer.league}
          initialName={selectedPlayer.name}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </section>
  );
};
