import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, ShieldCheck, Smartphone, Download, ScanLine, KeyRound } from 'lucide-react';
import storeImage from '../assets/naturgy-store.png';

const NATURGY_LOGO = 'https://www.naturgy.es/content/dam/naturgy/espana/global/logos/logo_naturgy_home_mobile.svg';

export default function LoginPage() {
  const {
    signIn, signOut, isAuthenticated, loading: authLoading,
    mfaRequired, enrollMfa, verifyMfa,
  } = useAuthContext();

  // ─── Login form state ──────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Reset password state (deshabilitado — sin SMTP configurado) ─────────
  // Si se necesita resetear una contraseña, el admin lo hace desde el módulo
  // de administración de usuarios (🔑 Cambiar contraseña).

  // ─── MFA state ─────────────────────────────────────────────────────────────
  // mfaStep: null (login normal), 'enroll' (mostrar QR), 'verify' (pedir código)
  const [mfaStep, setMfaStep] = useState(null);
  const [factorId, setFactorId] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  if (authLoading) return null;
  if (isAuthenticated) return <Navigate to="/home" replace />;

  // ─── Login ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Introduce email y contraseña'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await signIn(email, password);
      // Si signIn devuelve info de MFA, mostrar el paso correspondiente
      if (result?.mfa?.required) {
        if (result.mfa.enrolled) {
          setFactorId(result.mfa.factorId);
          setMfaStep('verify');
        } else {
          // Necesita registrar un factor TOTP (primera vez)
          await startEnrollment();
        }
      }
      // Si no hay MFA, isAuthenticated se pone a true y <Navigate> redirige
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── MFA enrollment ────────────────────────────────────────────────────────
  async function startEnrollment() {
    setMfaLoading(true);
    setMfaError('');
    try {
      const data = await enrollMfa();
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setMfaStep('enroll');
    } catch (err) {
      setMfaError(err.message || 'Error al generar el código QR');
    } finally {
      setMfaLoading(false);
    }
  }

  // ─── MFA verification (both enroll confirm and login verify) ───────────────
  async function handleVerifyMfa() {
    if (!totpCode || totpCode.length !== 6) {
      setMfaError('Introduce el código de 6 dígitos');
      return;
    }
    setMfaLoading(true);
    setMfaError('');
    try {
      await verifyMfa(factorId, totpCode);
      // Si verifyMfa no lanza error, la sesión sube a aal2 y mfaRequired
      // se pone a false en useAuth → isAuthenticated=true → redirect a /home
    } catch (err) {
      const msg = err.message || 'Código incorrecto';
      setMfaError(msg.includes('Invalid') ? 'Código incorrecto. Inténtalo de nuevo.' : msg);
      setTotpCode('');
    } finally {
      setMfaLoading(false);
    }
  }

  // ─── Cancelar MFA y volver al login ────────────────────────────────────────
  function cancelMfa() {
    setMfaStep(null);
    setFactorId(null);
    setQrCode(null);
    setTotpCode('');
    setMfaError('');
    // Cerrar la sesión aal1 parcial para que pueda intentar de nuevo
    signOut();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  // Determinar qué contenido mostrar dentro del formulario
  function renderFormContent() {
    // ===== PASO MFA: ENROLLMENT (primera vez) =====
    if (mfaStep === 'enroll') {
      return (
        <>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={20} className="text-brand-500" />
            <h2 className="text-base font-bold text-text-primary">Protege tu cuenta</h2>
          </div>

          {/* ── PASO 1: Descargar app ── */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">1</div>
              <span className="text-sm font-semibold text-text-primary">Descarga una app autenticadora</span>
            </div>
            <p className="text-[11px] text-text-secondary ml-8 mb-2">
              Si aún no tienes una, instálala gratis en tu móvil:
            </p>
            <div className="ml-8 flex flex-col gap-1.5">
              <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg hover:border-brand-500 transition-colors">
                <Download size={14} className="text-brand-500 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><strong>Google Authenticator</strong> — Android</span>
              </a>
              <a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg hover:border-brand-500 transition-colors">
                <Download size={14} className="text-brand-500 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><strong>Google Authenticator</strong> — iPhone</span>
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.azure.authenticator" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg hover:border-brand-500 transition-colors">
                <Download size={14} className="text-brand-500 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><strong>Microsoft Authenticator</strong> — Android</span>
              </a>
              <a href="https://apps.apple.com/app/microsoft-authenticator/id983156458" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg hover:border-brand-500 transition-colors">
                <Download size={14} className="text-brand-500 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><strong>Microsoft Authenticator</strong> — iPhone</span>
              </a>
            </div>
          </div>

          {/* ── PASO 2: Escanear QR ── */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">2</div>
              <span className="text-sm font-semibold text-text-primary">Escanea este código QR</span>
            </div>
            <p className="text-[11px] text-text-secondary ml-8 mb-2">
              Abre la app en tu móvil, pulsa el botón <strong>+</strong> (o "Añadir cuenta") y apunta la cámara a este código:
            </p>
            {qrCode && (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl border-2 border-brand-500/30 inline-block">
                  <img src={qrCode} alt="Código QR para autenticador" className="w-44 h-44" />
                </div>
              </div>
            )}
          </div>

          {/* ── PASO 3: Introducir código ── */}
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">3</div>
              <span className="text-sm font-semibold text-text-primary">Introduce el código de la app</span>
            </div>
            <p className="text-[11px] text-text-secondary ml-8 mb-2">
              Tras escanear el QR, la app mostrará un código de <strong>6 dígitos</strong> que cambia cada 30 segundos. Introdúcelo aquí:
            </p>
          </div>

          {mfaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3 text-sm text-red-600">{mfaError}</div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
              className="w-full px-4 py-3 bg-white border border-surface-3 rounded-xl text-text-primary text-center text-2xl tracking-[0.5em] font-mono placeholder-text-muted focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              autoFocus
            />
            <button onClick={handleVerifyMfa} disabled={mfaLoading || totpCode.length !== 6}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-500/20">
              {mfaLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verificando...</> : 'Activar y entrar'}
            </button>
            <button onClick={cancelMfa}
              className="w-full py-2 text-text-secondary text-sm font-semibold hover:text-text-primary transition-colors">
              ← Cancelar
            </button>
          </div>
        </>
      );
    }

    // ===== PASO MFA: VERIFY (login posterior) =====
    if (mfaStep === 'verify' || mfaRequired) {
      return (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Smartphone size={20} className="text-brand-500" />
            <h2 className="text-lg font-bold text-text-primary">Verificación en dos pasos</h2>
          </div>
          <p className="text-xs text-text-secondary mb-4">
            Abre tu app autenticadora e introduce el código de 6 dígitos que aparece en pantalla.
          </p>

          {mfaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3 text-sm text-red-600">{mfaError}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Código de verificación
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                className="w-full px-4 py-3 bg-white border border-surface-3 rounded-xl text-text-primary text-center text-2xl tracking-[0.5em] font-mono placeholder-text-muted focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                autoFocus
              />
            </div>
            <button onClick={handleVerifyMfa} disabled={mfaLoading || totpCode.length !== 6}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-500/20">
              {mfaLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verificando...</> : 'Verificar'}
            </button>
            <button onClick={cancelMfa}
              className="w-full py-2 text-text-secondary text-sm font-semibold hover:text-text-primary transition-colors">
              ← Volver al login
            </button>
          </div>
        </>
      );
    }

    // ===== LOGIN NORMAL =====
    return (
      <>
        <h2 className="text-lg font-bold text-text-primary mb-5">Iniciar sesión</h2>
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-600">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com" autoComplete="email"
              className="w-full px-4 py-3 bg-white border border-surface-3 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Contraseña</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                className="w-full px-4 py-3 pr-12 bg-white border border-surface-3 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <span className="text-[11px] text-text-muted">
              ¿Olvidaste tu contraseña? Contacta con tu administrador.
            </span>
          </div>
          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-500/20">
            {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo — foto tienda Naturgy (solo desktop) */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img
          src={storeImage}
          alt="Tienda Naturgy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
        <div className="absolute top-6 left-6 z-10">
          <img src={NATURGY_LOGO} alt="Naturgy"
            className="h-8 brightness-0 invert opacity-90 drop-shadow-lg"
            onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <div className="absolute bottom-5 left-6 z-10 text-[10px] text-white/70 drop-shadow-md">
          © {new Date().getFullYear()} Naturgy · CRM para KAMs
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white relative overflow-hidden">

        {/* Foto como fondo en móvil */}
        <div className="absolute inset-0 lg:hidden">
          <img
            src={storeImage}
            alt="Tienda Naturgy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-white" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 35%, rgba(255,255,255,0.92) 55%, rgba(255,255,255,1) 68%)' }} />
        </div>

        {/* Logo Naturgy arriba en móvil */}
        <div className="absolute top-4 left-4 z-10 lg:hidden">
          <img src={NATURGY_LOGO} alt="Naturgy"
            className="h-6 brightness-0 invert opacity-90 drop-shadow-lg"
            onError={(e) => { e.target.style.display = 'none'; }} />
        </div>

        <div className="w-full max-w-sm relative z-10 lg:mt-0 mt-auto mb-6 lg:mb-0">

          {/* Logo y título desktop */}
          <div className="text-center mb-8 hidden lg:block">
            <img src={NATURGY_LOGO} alt="Naturgy" className="h-10 mx-auto mb-4"
              onError={(e) => { e.target.style.display = 'none'; }} />
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary mb-1">CRM para KAMs</h1>
          </div>

          {/* Título móvil */}
          <div className="text-center mb-5 lg:hidden">
            <h1 className="text-2xl font-extrabold tracking-tight text-text-primary mb-1">CRM para KAMs</h1>
          </div>

          {/* Formulario (login / reset / MFA enroll / MFA verify) */}
          <div className="bg-white/[0.97] lg:bg-surface-1 border border-surface-3 rounded-2xl p-6 shadow-sm backdrop-blur-sm lg:backdrop-blur-none">
            {renderFormContent()}
          </div>

          {!mfaStep && (
            <p className="text-center text-text-muted text-xs mt-6">¿No tienes cuenta? <a href="mailto:kamapp.reporte@gmail.com" className="text-brand-500 font-semibold hover:text-brand-600">Contacta con el administrador</a>.</p>
          )}

          <div className="text-center mt-8 pt-5 border-t border-surface-3">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.12em] mb-1.5">Powered by</p>
            <img src={NATURGY_LOGO} alt="Naturgy" className="h-4 mx-auto opacity-35"
              onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        </div>
      </div>
    </div>
  );
}
