import React from 'react';
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
import type { WinProbPoint } from '../types/sports.ts';

interface WinProbabilityChartProps {
  points: WinProbPoint[];
  mode: 'live_plays' | 'historical_trend';
  homeAbbrev: string;
  awayAbbrev: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: WinProbPoint;
  }>;
  homeAbbrev: string;
  awayAbbrev: string;
}

const ChartTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  homeAbbrev,
  awayAbbrev,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0D1015] border border-white/[0.12] rounded-xl px-3 py-2.5 text-xs shadow-xl space-y-1.5 min-w-[165px]">
      <div className="font-medium text-slate-200">{point.context || point.label}</div>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-400">{homeAbbrev} (Local)</span>
          <span className="text-white font-semibold">{point.homeProb}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">{awayAbbrev} (Vis.)</span>
          <span className="text-white font-semibold">{point.awayProb}%</span>
        </div>
        {point.drawProb !== undefined && point.drawProb > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-amber-400">Empate</span>
            <span className="text-white font-semibold">{point.drawProb}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const WinProbabilityChart: React.FC<WinProbabilityChartProps> = ({
  points,
  mode,
  homeAbbrev,
  awayAbbrev,
}) => {
  if (!points || points.length === 0) return null;

  const hasDrawLine = points.some((p) => p.drawProb !== undefined && p.drawProb > 0);
  const latest = points[points.length - 1];

  return (
    <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">
            Evolución de probabilidad de victoria
          </h4>
          <p className="text-xs text-slate-400">
            {mode === 'live_plays'
              ? 'Trayectoria jugada a jugada durante el partido'
              : 'Curva basada en tendencia histórica, últimos 5 partidos y marcador'}
          </p>
        </div>

        {/* Clean inline legend without pills */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
          <span className="inline-flex items-center gap-1.5 text-slate-200">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
            {homeAbbrev} {latest?.homeProb ?? 0}%
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="w-3 h-0.5 bg-slate-400 rounded-full" />
            {awayAbbrev} {latest?.awayProb ?? 0}%
          </span>
          {hasDrawLine && latest?.drawProb !== undefined && (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <span className="w-3 h-0.5 bg-amber-400 rounded-full" />
              Emp {latest.drawProb}%
            </span>
          )}
        </div>
      </div>

      <div className="w-full h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
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
              content={<ChartTooltip homeAbbrev={homeAbbrev} awayAbbrev={awayAbbrev} />}
              cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="homeProb"
              name={homeAbbrev}
              stroke="#10B981"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: '#10B981', strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="awayProb"
              name={awayAbbrev}
              stroke="#94A3B8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#94A3B8', strokeWidth: 0 }}
              isAnimationActive={false}
            />
            {hasDrawLine && (
              <Line
                type="monotone"
                dataKey="drawProb"
                name="Empate"
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3.5, fill: '#F59E0B', strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
