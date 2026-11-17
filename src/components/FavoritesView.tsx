import React from 'react';
import { Check, Star, Trash2 } from 'lucide-react';
import type { LeagueConfig, MatchSummaryCard } from '../types/sports.ts';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';
import { TeamLogo } from './TeamLogo.tsx';
import { MatchCard } from './MatchCard.tsx';

interface FavoritesViewProps {
  leagues: LeagueConfig[];
  allMatches: MatchSummaryCard[];
  onSelectMatch: (match: MatchSummaryCard) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  leagues,
  allMatches,
  onSelectMatch,
}) => {
  const {
    user,
    signInWithGoogle,
    followedLeagues,
    toggleFollowedLeague,
    favoriteTeams,
    toggleFavoriteTeam,
  } = useFirebaseSync();

  const favoriteMatches = allMatches.filter((m) =>
    favoriteTeams.some(
      (f) =>
        f.sport === m.sport &&
        f.league === m.league &&
        (f.teamId === m.home.id || f.teamId === m.away.id)
    )
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
            Equipos favoritos y ligas seguidas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Personaliza tu panel y recibe alertas instantáneas sincronizadas entre dispositivos.
          </p>
        </div>

        {!user && (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 transition-colors whitespace-nowrap self-start"
          >
            Sincronizar con Google
          </button>
        )}
      </div>

      {/* Favorite Teams */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Mis equipos ({favoriteTeams.length})
        </h2>

        {favoriteTeams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favoriteTeams.map((team) => (
              <div
                key={team.teamKey}
                className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TeamLogo src={team.logo} alt={team.name} abbrev={team.abbreviation} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{team.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {team.leagueName} · {team.abbreviation}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void toggleFavoriteTeam({
                      team: {
                        id: team.teamId,
                        name: team.name,
                        shortName: team.shortName,
                        abbreviation: team.abbreviation,
                        logo: team.logo,
                        homeAway: 'home',
                      },
                      sport: team.sport,
                      league: team.league,
                      leagueName: team.leagueName,
                    })
                  }
                  aria-label={`Eliminar ${team.name} de favoritos`}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-6 text-sm text-slate-400 flex items-center gap-3">
            <Star className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              Pulsa el icono de estrella en cualquier partido de la sección En vivo para añadir equipos a tu lista de seguimiento.
            </span>
          </div>
        )}
      </div>

      {/* Matches for Favorite Teams */}
      {favoriteMatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white">Partidos de tus equipos</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {favoriteMatches.map((m) => (
              <MatchCard key={`${m.league}_${m.id}`} match={m} onSelect={onSelectMatch} />
            ))}
          </div>
        </div>
      )}

      {/* Followed Leagues Configurator */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">Ligas activas en tu feed</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Selecciona las competiciones que quieres priorizar al abrir VektorSport.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {leagues.map((league) => {
            const active = followedLeagues.includes(league.id);
            return (
              <button
                key={league.id}
                type="button"
                onClick={() => void toggleFollowedLeague(league.id)}
                className={`min-h-[56px] p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                  active
                    ? 'bg-[#151C24] border-emerald-500/40 text-white'
                    : 'bg-[#11141A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{league.name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {league.sportLabel} · {league.country}
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? 'bg-emerald-500 text-slate-950' : 'bg-white/[0.05] text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
