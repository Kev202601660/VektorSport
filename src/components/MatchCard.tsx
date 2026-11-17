import React from 'react';
import { ChevronRight, Star } from 'lucide-react';
import type { MatchSummaryCard } from '../types/sports.ts';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';
import { formatKickoff, formatMoneyline } from '../utils/formatters.ts';
import { TeamLogo } from './TeamLogo.tsx';

interface MatchCardProps {
  match: MatchSummaryCard;
  onSelect: (match: MatchSummaryCard) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, onSelect }) => {
  const { isFavoriteTeam, toggleFavoriteTeam, oddsFormat } = useFirebaseSync();
  const isLive = match.statusState === 'in';
  const isPost = match.statusState === 'post';

  const homeFav = isFavoriteTeam(match.sport, match.league, match.home.id);
  const awayFav = isFavoriteTeam(match.sport, match.league, match.away.id);

  const handleStarClick = (e: React.MouseEvent, side: 'home' | 'away') => {
    e.stopPropagation();
    const team = side === 'home' ? match.home : match.away;
    void toggleFavoriteTeam({
      team,
      sport: match.sport,
      league: match.league,
      leagueName: match.leagueName,
    });
  };

  const metadataParts = [
    match.leagueName,
    isLive ? `En vivo · ${match.statusDetail}` : isPost ? match.statusDetail : formatKickoff(match.date),
  ];
  if (match.venue) {
    metadataParts.push(match.venue);
  }

  return (
    <article
      onClick={() => onSelect(match)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(match);
        }
      }}
      className="group bg-[#11141A] hover:bg-[#151922] border border-white/[0.08] rounded-2xl p-4 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      {/* Top unboxed metadata row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0 truncate">
          <span className="font-medium text-slate-300 shrink-0">{match.leagueName}</span>
          <span aria-hidden="true">·</span>
          <span className={`truncate ${isLive ? 'text-emerald-400 font-medium' : ''}`}>
            {isLive ? `En vivo · ${match.statusDetail}` : isPost ? match.statusDetail : formatKickoff(match.date)}
          </span>
          {match.venue && (
            <>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden sm:inline truncate text-slate-500">{match.venue}</span>
            </>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* Away & Home rows */}
      <div className="space-y-2.5">
        {[
          { team: match.away, fav: awayFav, side: 'away' as const },
          { team: match.home, fav: homeFav, side: 'home' as const },
        ].map(({ team, fav, side }) => {
          const showScore = isLive || isPost;
          return (
            <div key={team.id + side} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <TeamLogo src={team.logo} alt={team.name} abbrev={team.abbreviation} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm md:text-[15px] font-semibold truncate ${
                        isPost && team.winner === false ? 'text-slate-400' : 'text-white'
                      }`}
                    >
                      {team.shortName}
                    </span>
                    {team.record && (
                      <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                        {team.record}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {match.odds && !showScore && (
                  <span className="text-xs font-mono tabular-nums text-slate-400 min-w-[44px] text-right">
                    {formatMoneyline(
                      side === 'home' ? match.odds.homeMoneyline : match.odds.awayMoneyline,
                      oddsFormat
                    )}
                  </span>
                )}
                {showScore && (
                  <span
                    className={`text-lg font-mono tabular-nums font-bold min-w-[28px] text-right ${
                      isLive ? 'text-white' : team.winner ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {team.score ?? '0'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => handleStarClick(e, side)}
                  aria-label={fav ? `Quitar ${team.shortName} de favoritos` : `Guardar ${team.shortName} en favoritos`}
                  className={`min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl transition-colors ${
                    fav ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Star className={`w-4 h-4 ${fav ? 'fill-amber-400' : ''}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hairline bottom analytical footer */}
      {(match.odds?.details || match.leaders.length > 0) && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs text-slate-400">
          <div className="truncate">
            {match.leaders[0] ? (
              <span>
                {match.leaders[0].playerName} ({match.leaders[0].teamAbbrev}):{' '}
                <span className="font-mono tabular-nums text-slate-200">{match.leaders[0].displayValue}</span>
              </span>
            ) : (
              <span>Análisis IA disponible</span>
            )}
          </div>
          {match.odds?.overUnder !== undefined && (
            <span className="font-mono tabular-nums text-slate-400 shrink-0">
              O/U {match.odds.overUnder}
            </span>
          )}
        </div>
      )}
    </article>
  );
};
