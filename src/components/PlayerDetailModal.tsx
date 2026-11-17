import React, { useEffect, useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import type { PlayerDetailPayload, SportKey } from '../types/sports.ts';
import { PlayerAvatar, TeamLogo } from './TeamLogo.tsx';

interface PlayerDetailModalProps {
  playerId: string;
  sport: SportKey;
  league: string;
  initialName?: string;
  onClose: () => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  playerId,
  sport,
  league,
  initialName,
  onClose,
}) => {
  const [data, setData] = useState<PlayerDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/sports/player/${sport}/${league}/${playerId}`)
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'No se pudieron cargar las métricas del jugador.');
        }
        return res.json() as Promise<PlayerDetailPayload>;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Error de red.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [playerId, sport, league]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-2xl max-h-[90vh] bg-[#11141A] border border-white/[0.08] rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar src={data?.headshot} alt={data?.name || initialName || 'Jugador'} size="md" />
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-white truncate">
                {data?.name || initialName || 'Estadísticas del jugador'}
              </h3>
              {data ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                  {data.teamLogo && (
                    <TeamLogo src={data.teamLogo} alt={data.teamName} abbrev={data.teamAbbrev} size="sm" />
                  )}
                  <span>{data.teamName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{data.position}</span>
                  {data.jersey && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">#{data.jersey}</span>
                    </>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500">Cargando perfil oficial...</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha del jugador"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="h-16 rounded-xl bg-white/[0.04]" />
                ))}
              </div>
              <div className="h-40 rounded-xl bg-white/[0.04]" />
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {(data.age || data.heightWeight) && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {data.age && <span>{data.age}</span>}
                  {data.age && data.heightWeight && <span aria-hidden="true">·</span>}
                  {data.heightWeight && <span>{data.heightWeight}</span>}
                </div>
              )}

              {/* Season Summary Metrics */}
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Promedios y rendimiento de temporada
                </h4>
                {data.seasonSummary.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden">
                    {data.seasonSummary.map((item) => (
                      <div key={item.label} className="bg-[#0D1015] p-3">
                        <div className="text-xs text-slate-400 truncate">{item.label}</div>
                        <div className="text-lg font-mono tabular-nums font-semibold text-white mt-0.5">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Las métricas acumuladas de temporada aparecerán cuando el jugador registre minutos oficiales.
                  </p>
                )}
              </div>

              {/* Recent Game Log */}
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-3">
                  Registro de últimos partidos
                </h4>
                {data.recentGames.length > 0 ? (
                  <div className="overflow-x-auto border border-white/[0.08] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] bg-[#0D1015] text-slate-400">
                          <th className="py-2.5 px-3 font-medium">Fecha</th>
                          <th className="py-2.5 px-3 font-medium">Rival</th>
                          <th className="py-2.5 px-3 font-medium">Resultado</th>
                          {data.statColumns.map((col) => (
                            <th key={col} className="py-2.5 px-2.5 font-medium text-right font-mono">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {data.recentGames.map((g, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-mono tabular-nums">
                              {g.date}
                            </td>
                            <td className="py-2.5 px-3 text-slate-200 font-medium whitespace-nowrap">
                              {g.opponent}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap font-mono tabular-nums">
                              {g.result}
                            </td>
                            {data.statColumns.map((col) => (
                              <td key={col} className="py-2.5 px-2.5 text-right font-mono tabular-nums text-white">
                                {g.stats[col] ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sin registros recientes disponibles para esta competición.</p>
                )}
              </div>

              {data.latestNews.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 mb-2.5">Noticias y estado físico</h4>
                  <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl">
                    {data.latestNews.map((n, i) => (
                      <div key={i} className="p-3 flex items-start justify-between gap-3 text-xs">
                        <span className="text-slate-200 leading-relaxed">{n.headline}</span>
                        {n.published && (
                          <span className="text-slate-500 font-mono tabular-nums shrink-0">{n.published}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
