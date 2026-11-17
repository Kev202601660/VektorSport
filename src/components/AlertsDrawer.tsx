import React from 'react';
import { Bell, BellOff, Check, X } from 'lucide-react';
import { useFirebaseSync } from '../contexts/FirebaseContext.tsx';
import { getSportLabel } from '../utils/formatters.ts';

interface AlertsDrawerProps {
  open: boolean;
  sseConnected: boolean;
  onClose: () => void;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({ open, sseConnected, onClose }) => {
  const {
    alerts,
    markAlertRead,
    notificationsEnabled,
    toggleNotifications,
    oddsFormat,
    setOddsFormat,
  } = useFirebaseSync();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end md:items-stretch justify-end"
      onClick={onClose}
    >
      <aside
        aria-label="Centro de notificaciones y preferencias"
        className="w-full md:max-w-md h-[85vh] md:h-full bg-[#0D1015] border-t md:border-t-0 md:border-l border-white/[0.08] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Alertas y ajustes</h2>
            <p className="text-xs text-slate-400">
              {sseConnected ? 'Flujo de resultados en tiempo real activo' : 'Reconectando flujo en tiempo real...'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar notificaciones"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Preferences */}
          <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Notificaciones de resultados</div>
                <div className="text-xs text-slate-400">
                  Alertas push en cambios de marcador y finales.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggleNotifications()}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
                  notificationsEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#1A1F28] text-slate-300 hover:text-white'
                }`}
              >
                {notificationsEnabled ? (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    Activas
                  </>
                ) : (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    Pausadas
                  </>
                )}
              </button>
            </div>

            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Formato de cuotas</div>
              <div className="flex items-center gap-1 p-1 bg-[#161A22] rounded-xl border border-white/[0.06]">
                {(['decimal', 'american'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => void setOddsFormat(fmt)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      oddsFormat === fmt ? 'bg-[#222834] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {fmt === 'decimal' ? 'Decimal' : 'Americana'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real-Time Alerts List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Actividad reciente</h3>
            {alerts.length > 0 ? (
              <div className="divide-y divide-white/[0.06] bg-[#11141A] border border-white/[0.08] rounded-2xl overflow-hidden">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 flex items-start justify-between gap-3 ${
                      alert.read ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs text-emerald-400 font-medium">
                        {getSportLabel(alert.sport)} · {alert.title}
                      </div>
                      <p className="text-sm text-slate-200">{alert.message}</p>
                    </div>
                    {!alert.read && (
                      <button
                        type="button"
                        onClick={() => void markAlertRead(alert.id)}
                        aria-label="Marcar como leída"
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/[0.04] shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#11141A] border border-white/[0.08] rounded-2xl p-6 text-sm text-slate-400 text-center">
                Las actualizaciones de marcadores en vivo, inicios de partido y resultados finales aparecerán aquí automáticamente.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
