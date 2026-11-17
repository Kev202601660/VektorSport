import React from 'react';
import { Bell, LogOut, UserCheck } from 'lucide-react';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';

export type NavSection = 'live' | 'favorites' | 'predictions' | 'players';

interface HeaderProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenAlerts: () => void;
  unreadAlertsCount: number;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  { id: 'live', label: 'En vivo' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'predictions', label: 'IA Picks' },
  { id: 'players', label: 'Jugadores' },
];

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onSelectSection,
  onOpenAlerts,
  unreadAlertsCount,
}) => {
  const { user, signInWithGoogle, signOut, syncing } = useFirebaseSync();

  return (
    <header className="sticky top-0 z-30 h-[52px] md:h-16 bg-[#090B0E]/92 backdrop-blur-md border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('live')}
          className="font-display text-lg md:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-500 rounded"
        >
          VektorSport
        </button>

        {/* Zone 2: Clean single-line typography navigation links (desktop) */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action on desktop; compact alerts/sync on mobile */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenAlerts}
            aria-label={`Notificaciones (${unreadAlertsCount} sin leer)`}
            className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors relative"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              title="Cerrar sesión"
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-lg bg-[#161A22] border border-white/[0.08] text-xs font-medium text-slate-200 hover:bg-[#1E232E] transition-colors whitespace-nowrap shrink-0"
            >
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="max-w-[110px] truncate">
                {syncing ? 'Sincronizando...' : user.displayName?.split(' ')[0] || 'Cuenta'}
              </span>
              <LogOut className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center justify-center px-4 py-2 min-h-[40px] rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs md:text-sm hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              Sincronizar
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
