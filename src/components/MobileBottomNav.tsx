import React from 'react';
import { Activity, Bell, BrainCircuit, Star, Users } from 'lucide-react';
import type { NavSection } from './Header.tsx';

interface MobileBottomNavProps {
  activeSection: NavSection;
  alertsOpen: boolean;
  unreadAlertsCount: number;
  onSelectSection: (section: NavSection) => void;
  onOpenAlerts: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  alertsOpen,
  unreadAlertsCount,
  onSelectSection,
  onOpenAlerts,
}) => {
  const items: Array<{
    id: NavSection | 'alerts';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'live', label: 'En vivo', icon: Activity },
    { id: 'favorites', label: 'Favoritos', icon: Star },
    { id: 'predictions', label: 'IA Picks', icon: BrainCircuit },
    { id: 'players', label: 'Jugadores', icon: Users },
    { id: 'alerts', label: 'Alertas', icon: Bell },
  ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#090B0E]/95 backdrop-blur-md border-t border-white/[0.08]"
    >
      <div className="grid grid-cols-5 h-full">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.id === 'alerts' ? alertsOpen : !alertsOpen && activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'alerts') {
                  onOpenAlerts();
                } else {
                  onSelectSection(item.id);
                }
              }}
              className={`relative flex flex-col items-center justify-center min-h-[44px] transition-colors ${
                isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.id === 'alerts' && unreadAlertsCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </div>
              <span className="text-[11px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
