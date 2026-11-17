import React, { useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  Clock,
  MinusCircle,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';
import type { SavedPredictionDoc, SportKey } from '../types/sports.ts';
import { getSportLabel } from '../utils/formatters.ts';

interface PredictionsViewProps {
  onNavigateLive: () => void;
}

type StatusFilter = 'all' | 'pending' | 'won' | 'lost' | 'void';

interface AccuracyPoint {
  indexLabel: string;
  hitRate: number;
  matchTitle: string;
  selection: string;
  outcome: 'Ganada' | 'Perdida';
  dateLabel: string;
}

function parseTimestampMs(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof raw === 'object' && raw !== null) {
    const rec = raw as { toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') return rec.toMillis();
    if (typeof rec.seconds === 'number') return rec.seconds * 1000;
  }
  return 0;
}

function formatShortDate(raw: unknown): string {
  const ms = parseTimestampMs(raw);
  if (!ms) return 'Reciente';
  return new Date(ms).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

const HistoryTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload?: AccuracyPoint }>;
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className="bg-[#0D1015] border border-white/[0.12] rounded-xl px-3 py-2.5 text-xs shadow-xl space-y-1 max-w-[240px]">
      <div className="font-semibold text-white truncate">{pt.matchTitle}</div>
      <div className="text-slate-400 truncate">{pt.selection}</div>
      <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className={pt.outcome === 'Ganada' ? 'text-emerald-400' : 'text-red-400'}>
          {pt.outcome} · {pt.dateLabel}
        </span>
        <span className="text-white font-semibold">{pt.hitRate}%</span>
      </div>
    </div>
  );
};

export const PredictionsView: React.FC<PredictionsViewProps> = ({ onNavigateLive }) => {
  const {
    savedPredictions,
    addManualBet,
    updatePredictionStatus,
    deleteSavedPrediction,
  } = useFirebaseSync();

  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [sportFilter, setSportFilter] = useState<SportKey | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [submittingNew, setSubmittingNew] = useState(false);
  const [formSport, setFormSport] = useState<SportKey>('soccer');
  const [formMatch, setFormMatch] = useState('');
  const [formMarket, setFormMarket] = useState('Moneyline');
  const [formSelection, setFormSelection] = useState('');
  const [formConfidence, setFormConfidence] = useState('68');
  const [formEdge, setFormEdge] = useState<'Alto' | 'Moderado' | 'Especulativo'>('Moderado');
  const [formStatus, setFormStatus] = useState<'pending' | 'won' | 'lost' | 'void'>('pending');
  const [formError, setFormError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const pendingList = savedPredictions.filter((p) => p.status === 'pending');
    const wonList = savedPredictions.filter((p) => p.status === 'won');
    const lostList = savedPredictions.filter((p) => p.status === 'lost');
    const voidList = savedPredictions.filter((p) => p.status === 'void');
    const settled = [...wonList, ...lostList];

    const hitRate =
      settled.length > 0 ? Math.round((wonList.length / settled.length) * 1000) / 10 : null;

    const avgWonConfidence =
      wonList.length > 0
        ? Math.round(wonList.reduce((acc, p) => acc + p.confidence, 0) / wonList.length)
        : null;

    // Sort settled chronologically (oldest -> newest) for historical streak & curve
    const chronological = [...settled].sort((a, b) => {
      const aTime = parseTimestampMs(a.updatedAt) || parseTimestampMs(a.createdAt);
      const bTime = parseTimestampMs(b.updatedAt) || parseTimestampMs(b.createdAt);
      return aTime - bTime;
    });

    let streakCount = 0;
    let streakType: 'won' | 'lost' | null = null;
    for (let i = chronological.length - 1; i >= 0; i--) {
      const st = chronological[i].status as 'won' | 'lost';
      if (streakType === null) {
        streakType = st;
        streakCount = 1;
      } else if (st === streakType) {
        streakCount += 1;
      } else {
        break;
      }
    }

    let runningWins = 0;
    const timeline: AccuracyPoint[] = chronological.map((item, idx) => {
      if (item.status === 'won') runningWins += 1;
      const cumulativePct = Math.round(((runningWins / (idx + 1)) * 100) * 10) / 10;
      return {
        indexLabel: `#${idx + 1}`,
        hitRate: cumulativePct,
        matchTitle: item.matchTitle,
        selection: item.selection,
        outcome: item.status === 'won' ? 'Ganada' : 'Perdida',
        dateLabel: formatShortDate(item.updatedAt || item.createdAt),
      };
    });

    const sportsOrder: SportKey[] = ['soccer', 'basketball', 'hockey', 'football'];
    const bySport = sportsOrder.map((sport) => {
      const items = savedPredictions.filter((p) => p.sport === sport);
      const sportWon = items.filter((p) => p.status === 'won').length;
      const sportLost = items.filter((p) => p.status === 'lost').length;
      const sportSettled = sportWon + sportLost;
      const pct = sportSettled > 0 ? Math.round((sportWon / sportSettled) * 100) : null;
      return {
        sport,
        label: getSportLabel(sport),
        total: items.length,
        won: sportWon,
        settled: sportSettled,
        pct,
      };
    });

    return {
      pendingCount: pendingList.length,
      wonCount: wonList.length,
      lostCount: lostList.length,
      voidCount: voidList.length,
      settledCount: settled.length,
      hitRate,
      avgWonConfidence,
      streakCount,
      streakType,
      timeline,
      bySport,
    };
  }, [savedPredictions]);

  const filtered = useMemo(() => {
    return savedPredictions.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (sportFilter !== 'all' && p.sport !== sportFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${p.matchTitle} ${p.selection} ${p.market}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterStatus, savedPredictions, searchQuery, sportFilter]);

  const handleMarkStatus = async (pred: SavedPredictionDoc, nextStatus: 'won' | 'lost' | 'void') => {
    setActionError(null);
    setBusyId(pred.id);
    try {
      await updatePredictionStatus(pred.id, nextStatus);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo actualizar el resultado de la apuesta.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await deleteSavedPrediction(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo eliminar el registro.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateManualBet = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const matchTitle = formMatch.trim();
    const selection = formSelection.trim();
    const market = formMarket.trim() || 'Moneyline';
    const confNum = Number(formConfidence);

    if (!matchTitle) {
      setFormError('Indica el partido o enfrentamiento (ej. Arsenal vs Chelsea).');
      return;
    }
    if (!selection) {
      setFormError('Indica la selección o apuesta realizada (ej. Arsenal Gana).');
      return;
    }
    if (Number.isNaN(confNum) || confNum < 0 || confNum > 100) {
      setFormError('La confianza debe estar entre 0 y 100.');
      return;
    }

    setSubmittingNew(true);
    try {
      await addManualBet({
        sport: formSport,
        matchTitle,
        market,
        selection,
        confidence: confNum,
        edgeRating: formEdge,
        initialStatus: formStatus,
      });
      setFormMatch('');
      setFormSelection('');
      setFormMarket('Moneyline');
      setFormConfidence('68');
      setFormEdge('Moderado');
      setFormStatus('pending');
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar en el historial.');
    } finally {
      setSubmittingNew(false);
    }
  };

  return (
    <section className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
            Predicciones e Historial de Apuestas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Marca el resultado obtenido en cada pick para calcular tu tasa de acierto histórica en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs md:text-sm hover:bg-emerald-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? 'Cerrar formulario' : 'Registrar apuesta'}
          </button>
        </div>
      </div>

      {/* Historical Accuracy KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="bg-[#11141A] p-4">
          <div className="text-xs text-slate-400">Tasa de acierto histórica</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-400 mt-1">
            {stats.hitRate !== null ? `${stats.hitRate}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {stats.settledCount > 0
              ? `${stats.wonCount} de ${stats.settledCount} resueltas`
              : 'Sin apuestas resueltas'}
          </div>
        </div>

        <div className="bg-[#11141A] p-4">
          <div className="text-xs text-slate-400">Balance (G · P · N)</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
            {stats.wonCount}
            <span className="text-slate-500">·</span>
            {stats.lostCount}
            <span className="text-slate-500">·</span>
            {stats.voidCount}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {stats.pendingCount} pendientes por marcar
          </div>
        </div>

        <div className="bg-[#11141A] p-4">
          <div className="text-xs text-slate-400">Racha actual</div>
          <div
            className={`font-mono tabular-nums text-2xl font-bold mt-1 ${
              stats.streakType === 'won'
                ? 'text-emerald-400'
                : stats.streakType === 'lost'
                  ? 'text-red-400'
                  : 'text-white'
            }`}
          >
            {stats.streakCount > 0
              ? `${stats.streakCount}${stats.streakType === 'won' ? 'G' : 'P'}`
              : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {stats.streakCount > 0
              ? stats.streakType === 'won'
                ? `${stats.streakCount} ganada${stats.streakCount > 1 ? 's' : ''} seguida${stats.streakCount > 1 ? 's' : ''}`
                : `${stats.streakCount} perdida${stats.streakCount > 1 ? 's' : ''} seguida${stats.streakCount > 1 ? 's' : ''}`
              : 'Marca resultados para medir'}
          </div>
        </div>

        <div className="bg-[#11141A] p-4">
          <div className="text-xs text-slate-400">Confianza media en aciertos</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
            {stats.avgWonConfidence !== null ? `${stats.avgWonConfidence}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {savedPredictions.length} registro{savedPredictions.length === 1 ? '' : 's'} en total
          </div>
        </div>
      </div>

      {/* Historical Evolution Chart + Sport Breakdown */}
      {savedPredictions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-7 bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Evolución de tasa de acierto histórica
                </h2>
                <p className="text-xs text-slate-400">
                  Porcentaje acumulado de victorias a medida que cierras cada apuesta.
                </p>
              </div>
              {stats.hitRate !== null && (
                <span className="font-mono tabular-nums text-sm font-semibold text-emerald-400 shrink-0">
                  {stats.hitRate}%
                </span>
              )}
            </div>

            {stats.timeline.length >= 2 ? (
              <div className="w-full h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={stats.timeline}
                    margin={{ top: 8, right: 10, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="indexLabel"
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 3" />
                    <Tooltip
                      content={<HistoryTooltip />}
                      cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hitRate"
                      stroke="#10B981"
                      strokeWidth={2.2}
                      dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#34D399', strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-center px-4">
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Marca al menos 2 apuestas como Ganada o Perdida en el historial para visualizar la curva de evolución de tu acierto.
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Acierto por deporte</h2>
              <p className="text-xs text-slate-400">
                Efectividad verificada según competición.
              </p>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {stats.bySport.map((row) => (
                <div key={row.sport} className="py-2.5 first:pt-1 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-200 font-medium">{row.label}</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {row.settled > 0 ? (
                        <>
                          <span className="text-slate-300">
                            {row.won}/{row.settled}
                          </span>{' '}
                          ·{' '}
                          <span className="text-emerald-400 font-semibold">{row.pct}%</span>
                        </>
                      ) : (
                        `${row.total} reg.`
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${row.pct ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Bet Registration Form */}
      {showAddForm && (
        <form
          onSubmit={(e) => void handleCreateManualBet(e)}
          className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">
              Registrar nueva apuesta en el historial
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              aria-label="Cerrar formulario"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs text-slate-400">
              <span>Deporte</span>
              <select
                value={formSport}
                onChange={(e) => setFormSport(e.target.value as SportKey)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="soccer">Fútbol</option>
                <option value="basketball">Baloncesto</option>
                <option value="hockey">Hockey</option>
                <option value="football">Fútbol Americano</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Partido / Evento</span>
              <input
                type="text"
                maxLength={160}
                value={formMatch}
                onChange={(e) => setFormMatch(e.target.value)}
                placeholder="Ej. Real Madrid vs Barcelona"
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Selección</span>
              <input
                type="text"
                maxLength={120}
                value={formSelection}
                onChange={(e) => setFormSelection(e.target.value)}
                placeholder="Ej. Real Madrid Gana"
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Mercado</span>
              <input
                type="text"
                maxLength={100}
                value={formMarket}
                onChange={(e) => setFormMarket(e.target.value)}
                placeholder="Moneyline / Hándicap / Total"
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-slate-400">
                <span>Confianza (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={formConfidence}
                  onChange={(e) => setFormConfidence(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm font-mono tabular-nums text-white focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="space-y-1 text-xs text-slate-400">
                <span>Valor</span>
                <select
                  value={formEdge}
                  onChange={(e) =>
                    setFormEdge(e.target.value as 'Alto' | 'Moderado' | 'Especulativo')
                  }
                  className="w-full min-h-[42px] px-2.5 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Alto">Alto</option>
                  <option value="Moderado">Moderado</option>
                  <option value="Especulativo">Especulativo</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Estado / Resultado obtenido</span>
              <select
                value={formStatus}
                onChange={(e) =>
                  setFormStatus(e.target.value as 'pending' | 'won' | 'lost' | 'void')
                }
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D1015] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="pending">Pendiente</option>
                <option value="won">Ganada</option>
                <option value="lost">Perdida</option>
                <option value="void">Nula</option>
              </select>
            </label>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#161A22] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingNew}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 disabled:opacity-60 transition-colors"
            >
              {submittingNew ? 'Guardando...' : 'Guardar en historial'}
            </button>
          </div>
        </form>
      )}

      {/* Historial de Apuestas Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg md:text-xl font-bold text-white">
              Historial de Apuestas
            </h2>
            <p className="text-xs text-slate-400">
              {filtered.length} de {savedPredictions.length} registro
              {savedPredictions.length === 1 ? '' : 's'} mostrado
              {filtered.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative sm:w-56">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar partido o pick..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[#11141A] border border-white/[0.08] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              aria-label="Filtrar por deporte"
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value as SportKey | 'all')}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#11141A] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Todos los deportes</option>
              <option value="soccer">Fútbol</option>
              <option value="basketball">Baloncesto</option>
              <option value="hockey">Hockey</option>
              <option value="football">Fútbol Am.</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#11141A] border border-white/[0.08] rounded-xl overflow-x-auto no-scrollbar w-full sm:w-fit">
          {[
            { id: 'all' as const, label: `Todas (${savedPredictions.length})` },
            { id: 'pending' as const, label: `Pendientes (${stats.pendingCount})` },
            { id: 'won' as const, label: `Ganadas (${stats.wonCount})` },
            { id: 'lost' as const, label: `Perdidas (${stats.lostCount})` },
            { id: 'void' as const, label: `Nulas (${stats.voidCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filterStatus === tab.id
                  ? 'bg-[#222834] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            {actionError}
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
            {filtered.map((pred) => {
              const isBusy = busyId === pred.id;
              const dateText = formatShortDate(pred.updatedAt || pred.createdAt);

              return (
                <article
                  key={pred.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                      <span>{getSportLabel(pred.sport)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate text-slate-300">{pred.matchTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">{dateText}</span>
                    </div>

                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <h3 className="font-display text-base font-bold text-white">
                        {pred.selection}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {pred.market} · Valor {pred.edgeRating}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 flex-wrap">
                    <div className="text-left md:text-right mr-1">
                      <div className="text-[11px] text-slate-500">Confianza</div>
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-200">
                        {pred.confidence}%
                      </div>
                    </div>

                    {pred.status === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleMarkStatus(pred, 'won')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[40px] rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ganada
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleMarkStatus(pred, 'lost')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[40px] rounded-xl bg-red-500/15 text-red-300 text-xs font-semibold hover:bg-red-500/25 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Perdida
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleMarkStatus(pred, 'void')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[40px] rounded-xl bg-white/[0.06] text-slate-300 text-xs font-semibold hover:bg-white/[0.12] disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          Nula
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`inline-flex items-center gap-1.5 min-h-[40px] px-2 text-xs font-semibold whitespace-nowrap ${
                          pred.status === 'won'
                            ? 'text-emerald-400'
                            : pred.status === 'lost'
                              ? 'text-red-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {pred.status === 'won' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Ganada
                          </>
                        ) : pred.status === 'lost' ? (
                          <>
                            <XCircle className="w-4 h-4" />
                            Perdida
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4" />
                            Nula
                          </>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDelete(pred.id)}
                      aria-label={`Eliminar apuesta ${pred.selection}`}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : savedPredictions.length > 0 ? (
          <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm text-slate-300">
              No hay registros en el historial que coincidan con los filtros actuales.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('all');
                setSportFilter('all');
                setSearchQuery('');
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1A1F28] text-xs font-semibold text-white hover:bg-[#232A36] transition-colors"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-8 text-center space-y-4">
            <BrainCircuit className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">
                Tu historial de apuestas está vacío
              </h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Genera un análisis IA desde cualquier partido o registra una apuesta manualmente para marcar tus resultados y medir tu tasa de acierto histórica.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 transition-colors"
              >
                Registrar primera apuesta
              </button>
              <button
                type="button"
                onClick={onNavigateLive}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#161A22] border border-white/[0.08] text-slate-200 font-semibold text-sm hover:bg-[#1E232E] transition-colors"
              >
                Explorar partidos
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
