import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Building2, BarChart3, Trophy, Sparkles, CalendarDays, X, Bell, Database, Download } from 'lucide-react';
import { useAuthContext } from './AuthProvider';
import { useState, useEffect, lazy, Suspense } from 'react';
import { offlineQueue } from '../lib/offline';
import { supabase } from '../lib/supabase';
import { BulkReassignModal } from './ChannelReassign';

const AssistantPage = lazy(() => import('../pages/AssistantPage'));
const BenchmarkPanel = lazy(() => import('./BenchmarkPanel'));

const NATURGY_LOGO = 'https://www.naturgy.es/content/dam/naturgy/espana/global/logos/logo_naturgy_home_mobile.svg';

const baseNavItems = [
  { to: '/home', icon: Home, label: 'Mi día' },
  { to: '/channels', icon: Building2, label: 'Canales' },
  { to: '/calendar', icon: CalendarDays, label: 'Agenda' },
  { to: '/pipeline', icon: BarChart3, label: 'Pipeline' },
];

// ============ CAMPANITA DE NOTIFICACIONES ============
function NotificationsBell({ userId, onReassignClick }) {
  const [alerts, setAlerts] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  useEffect(() => {
    if (userId) loadAlerts();
  }, [userId]);

  async function loadAlerts() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(20);
      setAlerts(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(alert) {
    if (alert.is_read) return;
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_read: true } : a));
    await supabase.from('alerts').update({ is_read: true }).eq('id', alert.id);
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    return `hace ${Math.floor(diffH / 24)}d`;
  }

  return (
    <div className="relative">
      <button onClick={() => setShowPanel(!showPanel)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-text-secondary hover:bg-surface-2 transition-colors">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 top-11 z-50 bg-white border border-surface-3 rounded-xl shadow-lg w-80 max-h-96 overflow-y-auto">
            <div className="px-4 py-3 border-b border-surface-3">
              <span className="text-sm font-bold text-text-primary">Notificaciones</span>
            </div>
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-text-muted">Cargando...</div>
            ) : alerts.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-text-muted">Sin notificaciones</div>
            ) : (
              alerts.map(a => (
                <div key={a.id}
                  className={`px-4 py-3 border-b border-surface-3 last:border-0 transition-colors ${
                    a.is_read ? 'bg-white' : 'bg-brand-500/5'
                  }`}>
                  <button onClick={() => markAsRead(a)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-semibold ${a.is_read ? 'text-text-secondary' : 'text-text-primary'}`}>{a.title}</span>
                      {!a.is_read && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0 mt-1" />}
                    </div>
                    {a.detail && <p className="text-[11px] text-text-secondary mt-0.5">{a.detail}</p>}
                    <span className="text-[10px] text-text-muted mt-1 block">{timeAgo(a.created_at)}</span>
                  </button>
                  {a.title === 'Canales reasignados' && onReassignClick && (
                    <button onClick={() => { markAsRead(a); onReassignClick(); }}
                      className="mt-2 text-[11px] font-semibold text-brand-500 hover:text-brand-600">
                      Repartir estos canales →
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, profile, signOut, isManager } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);

  // Acceso al módulo de administración: directores O usuarios con can_manage_users
  const canAdmin = profile?.role === 'director' || profile?.can_manage_users;

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const check = async () => { const c = await offlineQueue.count(); setPendingCount(c); };
    check();
    const h = () => check();
    window.addEventListener('offline-sync-complete', h);
    return () => window.removeEventListener('offline-sync-complete', h);
  }, []);

  return (
    <div className="app-container">
      {!isOnline && (
        <div className="bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Sin conexión · Los datos se sincronizarán automáticamente
          {pendingCount > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-full">{pendingCount} pendientes</span>}
        </div>
      )}

      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-3 shadow-sm">
        <button onClick={() => navigate('/home')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img src={NATURGY_LOGO} alt="Naturgy" className="h-[18px] opacity-60"
            onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-px h-4 bg-surface-3" />
          <span className="font-bold text-sm text-text-primary tracking-tight">CRM para KAMs</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Configurable data export */}
          <button
            onClick={() => {
              if (location.pathname !== '/export') {
                navigate('/export', { state: { returnTo: `${location.pathname}${location.search}` } });
              }
              setShowAssistant(false);
              setShowBenchmark(false);
            }}
            title="Extraer datos"
            aria-label="Extraer datos"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-surface-3 bg-white text-text-secondary transition-all hover:bg-surface-1 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
          >
            <Download size={14} />
            <span className="hidden sm:inline text-xs font-semibold">Extraer</span>
          </button>

          {/* Shared market benchmark */}
          <button onClick={() => { setShowBenchmark(previous => !previous); setShowAssistant(false); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-white text-xs font-semibold text-teal-700 transition-all hover:bg-teal-50 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2">
            {showBenchmark ? <X size={14} /> : <Database size={14} />}
            <span className="hidden sm:inline">{showBenchmark ? 'Cerrar' : 'Benchmark'}</span>
          </button>

          {/* AI Assistant button */}
          <button onClick={() => { setShowAssistant(previous => !previous); setShowBenchmark(false); }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-xs font-semibold transition-all sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
            style={{
              background: showAssistant ? '#E87A1E' : 'rgba(232,122,30,0.08)',
              color: showAssistant ? 'white' : '#E87A1E',
              border: `1px solid ${showAssistant ? '#E87A1E' : 'rgba(232,122,30,0.3)'}`,
            }}>
            {showAssistant ? <X size={14} /> : <Sparkles size={14} />}
            <span className="hidden sm:inline">{showAssistant ? 'Cerrar' : 'Asistente'}</span>
            {!showAssistant && <div className="w-1.5 h-1.5 rounded-full bg-green-500 absolute -top-0.5 -right-0.5" />}
          </button>

          <NotificationsBell userId={user?.id} onReassignClick={() => setShowReassignModal(true)} />

          {/* Avatar menu */}
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white">
                {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
              </div>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-10 z-50 bg-white border border-surface-3 rounded-xl shadow-lg py-2 w-48">
                  <div className="px-4 py-2 border-b border-surface-3">
                    <div className="text-sm font-semibold text-text-primary">{profile?.full_name}</div>
                    <div className="text-xs text-text-secondary capitalize">{profile?.role}</div>
                  </div>
                  {isManager && (
                    <NavLink to="/dashboard" onClick={() => setShowMenu(false)}
                      className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary">
                      📊 Dashboard Manager
                    </NavLink>
                  )}
                  {canAdmin && (
                    <NavLink to="/admin/users" onClick={() => setShowMenu(false)}
                      className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary">
                      👤 Administrar usuarios
                    </NavLink>
                  )}
                  <NavLink to="/rvc" onClick={() => setShowMenu(false)}
                    className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary">
                    📈 RVC
                  </NavLink>
                  <NavLink to="/import" onClick={() => setShowMenu(false)}
                    className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary">
                    📥 Importar canales
                  </NavLink>
                  <NavLink to="/report" onClick={() => setShowMenu(false)}
                    className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-1 hover:text-text-primary">
                    📊 Informe semanal
                  </NavLink>
                  <button onClick={() => { setShowMenu(false); signOut(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-surface-1">
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-content px-4 pt-4 pb-4">
        <Outlet />
      </main>

      {/* Assistant overlay */}
      {showAssistant && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex min-h-0 flex-col bg-surface-0" style={{ top: 56, height: 'calc(100dvh - 56px)' }}>
          <Suspense fallback={
            <div className="flex items-center justify-center flex-1">
              <div className="animate-spin text-brand-500"><Sparkles size={24} /></div>
            </div>
          }>
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
              <AssistantPage />
            </div>
          </Suspense>
        </div>
      )}

      <Suspense fallback={null}>
        <BenchmarkPanel open={showBenchmark} onClose={() => setShowBenchmark(false)} />
      </Suspense>

      {!showAssistant && !showBenchmark && (
        <nav className="bottom-nav border-t border-surface-3">
          <div className="flex justify-around py-2 px-2">
            {[...baseNavItems, ...(isManager ? [{ to: '/ranking', icon: Trophy, label: 'Ranking' }] : [])].map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-brand-500' : 'text-text-muted hover:text-text-secondary'}`}>
                <Icon size={20} strokeWidth={2} />
                <span className="text-[10px] font-semibold">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {/* Modal de reasignación, abierto desde una alerta de "Canales reasignados".
          Se preselecciona al propio usuario como origen, ya que es quien acaba
          de recibir canales tras la baja de otro usuario. */}
      {showReassignModal && (
        <BulkReassignModal
          initialFromKam={user?.id}
          onClose={() => setShowReassignModal(false)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}
