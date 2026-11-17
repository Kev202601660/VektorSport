import type { SportKey } from '../types/sports.ts';

export const SPORT_TABS: Array<{ id: SportKey | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'soccer', label: 'Fútbol' },
  { id: 'basketball', label: 'Baloncesto' },
  { id: 'hockey', label: 'Hockey' },
  { id: 'football', label: 'Fútbol Am.' },
];

export function getSportLabel(sport: SportKey): string {
  switch (sport) {
    case 'soccer':
      return 'Fútbol';
    case 'basketball':
      return 'Baloncesto';
    case 'hockey':
      return 'Hockey';
    case 'football':
      return 'Fútbol Americano';
  }
}

export function formatKickoff(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy ${timeStr}`;
    const dayStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    return `${dayStr} ${timeStr}`;
  } catch {
    return '';
  }
}

export function formatMoneyline(raw: string | undefined, format: 'decimal' | 'american'): string {
  if (!raw) return '—';
  const num = Number(raw);
  if (Number.isNaN(num) || num === 0) return raw;
  if (format === 'american') {
    return num > 0 ? `+${num}` : `${num}`;
  }
  const decimal = num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
  return decimal.toFixed(2);
}
