# CRM para KAMs — Documentación de arquitectura y traspaso

> Última actualización: 20 de julio de 2026.
> Este documento describe el estado **real** del sistema en producción, verificado directamente contra el código de los repositorios y la base de datos de Supabase — no es una memoria de diseño original, sino un inventario actual.

---

## 1. Visión general

Es un CRM interno de Naturgy para el equipo de KAMs (Key Account Managers) que gestionan canales de venta en el área de CAEs (Certificados de Ahorro Energético), Energía y Solar. Permite:

- Gestionar canales (empresas/contactos comerciales) a través de un pipeline de ventas
- Registrar visitas, llamadas e interacciones con cada canal
- Planificar agenda y seguimiento
- Ver paneles de manager/director con visibilidad sobre el equipo
- Gamificación (ranking, insignias) entre KAMs
- Panel RVC con KPIs de seguimiento comercial (leads, tasa de éxito, captación, volumen, visitas)
- Funciona como PWA (instalable en móvil) con cola de sincronización si no hay conexión

El nombre interno de la PWA en el código sigue siendo `FieldForce CRM` — es el nombre del proyecto original del que evolucionó este CRM; no afecta a nada funcional, pero puede generar confusión si alguien lo ve en el manifest del navegador.

### Jerarquía de roles

Hay 4 roles, definidos en `profiles.role`: `kam` → `coordinator` → `manager` → `director`. Un director ve y gestiona **todo** el sistema (todos los KAMs, sin excepción, sea cual sea la jerarquía de `reports_to`). Los demás roles ven su propia jerarquía descendente, calculada de forma recursiva.

---

## 2. Arquitectura técnica

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   FRONTEND       │      │     BACKEND       │      │    SUPABASE      │
│   React + Vite   │─────▶│  Python / Flask    │─────▶│  Postgres + Auth  │
│   (Netlify)       │      │   (Railway)       │      │  + Edge Functions │
└─────────────────┘      └──────────────────┘      └─────────────────┘
   kamsnc.netlify.app      web-production-08c73.       gjnhyesrqhizdekljzhm
                            up.railway.app              .supabase.co
```

| Pieza | Repositorio GitHub | Dónde vive |
|---|---|---|
| Frontend | `rfranzaalvarez/KAMSNC` | Netlify (`kamsnc.netlify.app`) |
| Backend | `rfranzaalvarez/KAMAPP` | Railway, plan **Hobby** |
| Base de datos | (no tiene repo propio; se gestiona desde el panel de Supabase) | Supabase (proyecto `gjnhyesrqhizdekljzhm`) |

El frontend habla **directamente** con Supabase (Postgres + Auth) para casi todo: leer/escribir canales, visitas, perfiles, etc. El backend Flask en Railway solo se usa para un puñado de tareas concretas que no pueden hacerse desde el navegador (ver sección 5).

### Por qué casi todo el frontend habla directo con Supabase

El patrón habitual en este proyecto es: el componente React llama a `supabase.from('tabla').select()/.insert()/.update()` directamente, usando la **clave anon** (pública, segura de exponer en el navegador) y confiando en las **políticas RLS** de Postgres para decidir qué puede ver o modificar cada usuario según su rol. Esto significa que la seguridad real del sistema no está en el código de React, sino en las políticas de la base de datos (sección 4).

---

## 3. Esquema real de la base de datos (19 tablas)

**Nota:** el archivo `database/schema.sql` en el repositorio `KAMSNC` se regeneró el 19 de junio de 2026 a partir de la base de datos real en Supabase, y refleja 18 de las 19 tablas actuales (falta `channel_meetings`, añadida posteriormente). Si en el futuro se añaden o modifican tablas directamente en Supabase, este archivo quedará desactualizado de nuevo — lo más fiable es regenerarlo periódicamente desde Supabase (ver sección 8.3).

| Tabla | Para qué sirve |
|---|---|
| `profiles` | Usuarios del CRM (espejo de `auth.users` + campos propios: rol, zona, `reports_to`, `is_active`) |
| `channels` | Los canales/empresas gestionados por los KAMs — la entidad central del CRM |
| `channel_classification` | Catálogo de clasificaciones posibles (Energía, Solar, CAEs + subcanales) |
| `channel_classifications` | Tabla puente: qué clasificación(es) tiene cada canal |
| `channel_notes` | Notas de texto libre sobre un canal |
| `channel_interactions` | Registro de llamadas, emails, reuniones, etc. con un canal |
| `channel_pipeline_history` | Historial de cambios de fase del pipeline de cada canal |
| `channel_contact_prep` | Notas de preparación antes de contactar/visitar un canal |
| `channel_meetings` | Actas de reuniones con canales (fecha, asistentes, notas, documento adjunto) |
| `visits` | Visitas físicas registradas (check-in) |
| `planned_visits` | Visitas/citas planificadas en agenda |
| `account_plans` | Planes de cuenta anuales por canal |
| `account_plan_actions` | Acciones concretas dentro de un plan de cuenta |
| `account_plan_documents` | Documentos adjuntos a un plan de cuenta |
| `alerts` | Notificaciones internas del CRM (la "campanita") |
| `badges` | Insignias de gamificación ganadas por un usuario |
| `leaderboard_weekly` / `leaderboard_monthly` | Rankings de gamificación |
| `kam_playbook` | Contenido de referencia/formación para KAMs |

### Tablas clave en detalle

**`profiles`** — espejo de `auth.users`, se crea automáticamente vía el trigger `handle_new_user` (sección 4.3) cuando alguien se registra. Columnas relevantes: `role` (`kam`/`coordinator`/`manager`/`director`), `reports_to` (uuid, jerarquía), `is_active` (boolean — usado para el sistema de "baja de usuario", ver sección 6.1), `can_manage_users` (boolean — da acceso al módulo de administración de usuarios sin necesitar `role = 'director'`, ver sección 6.6), `zone`.

**`channels`** — entidad central. Columnas relevantes: `assigned_to` (uuid → qué KAM lleva este canal), `pipeline_stage` (fase interna: `lead`/`first_contact`/`proposal`/`negotiation`/`onboarding`/`active`/`closed_no_deal`), `status` (estado visible al usuario, **derivado** de `pipeline_stage` vía la función `stageToStatus()` en `crmConstants.js` — son dos campos relacionados pero no idénticos), `lead_source` (text array, con valores agrupados en PULL/PUSH — sección 6.11), `rejection_reason` (text, motivo de descarte cuando el canal está rechazado o cerrado sin acuerdo — sección 6.3).

**`alerts`** — sistema de notificaciones internas. `alert_type` está limitado por un `CHECK constraint` a estos 6 valores exactos: `task`, `followup_overdue`, `pipeline_stalled`, `channel_inactive`, `plan_review`, `system`. Si en el futuro se necesita un tipo nuevo, hay que ampliar este constraint en Supabase antes de poder insertarlo.

### Foreign keys hacia `profiles` (importante para bajas/borrados)

10 tablas distintas tienen una FK con `ON DELETE NO ACTION` apuntando a `profiles.id`: `channels.assigned_to`, `visits.kam_id`, `planned_visits.kam_id`, `alerts.user_id`, `account_plans.kam_id`, `account_plan_documents.uploaded_by`, `channel_notes.user_id`, `channel_interactions.user_id`, `channel_pipeline_history.changed_by`, `profiles.reports_to`. Esto significa que **nunca se puede borrar físicamente un usuario** que tenga cualquier dato relacionado en estas tablas — la base de datos lo bloqueará. Por este motivo, el sistema usa **baja lógica** (`is_active = false`) en vez de borrado real (ver sección 6.1).

---

## 4. Autenticación y seguridad

### 4.1 Cómo funciona el login (con 2FA obligatorio)

El login tiene dos pasos obligatorios para todos los usuarios, sin excepción:

1. **Email + contraseña** — vía Supabase Auth (`supabase.auth.signInWithPassword`). Si la contraseña es correcta, la sesión se crea con nivel AAL1 (Authenticator Assurance Level 1 = solo contraseña).

2. **Código TOTP de app autenticadora** — el usuario introduce el código de 6 dígitos que genera su app (Google Authenticator, Microsoft Authenticator, o cualquier app compatible con TOTP). Si es correcto, la sesión sube a AAL2 y se concede acceso al CRM.

**La primera vez** que un usuario inicia sesión, en vez del paso 2, ve una pantalla de configuración con una guía visual de 3 pasos (descargar app autenticadora con enlaces directos a las tiendas, escanear el QR que genera Supabase, e introducir el código para verificar). Una vez completado, el factor TOTP queda registrado permanentemente para ese usuario.

**Implementación técnica:**
- `useAuth.js` expone `mfaRequired` (boolean), `enrollMfa()` y `verifyMfa()`. La propiedad `isAuthenticated` requiere que `mfaRequired` sea `false` (es decir, que el usuario haya completado ambos pasos). Esto impide que un usuario con solo contraseña (AAL1) acceda a ninguna ruta protegida.
- `LoginPage.jsx` gestiona un estado interno `mfaStep` (`null` → `'enroll'` → `'verify'`) que determina qué pantalla mostrar: el formulario de login, la guía de enrollment con QR, o el campo de código TOTP.
- La API de MFA de Supabase se usa de forma nativa: `mfa.enroll({ factorType: 'totp' })`, `mfa.challengeAndVerify({ factorId, code })`, `mfa.getAuthenticatorAssuranceLevel()`, `mfa.listFactors()`.
- No hay dependencia de ningún servicio externo de email, SMS ni proveedor de terceros. Todo funciona localmente entre la app autenticadora del móvil del usuario y Supabase Auth.

**Reseteo de MFA:** si un usuario pierde acceso a su app autenticadora (cambio de móvil, pérdida del dispositivo, etc.), un administrador puede resetear su factor TOTP desde el módulo de administración de usuarios: lápiz de edición → **📱 Resetear MFA**. Esto borra los factores TOTP del usuario en Supabase Auth (vía la Edge Function `manage-users`, acción `reset_mfa`), y en su próximo login le aparecerá la pantalla de enrollment con un QR nuevo, como si fuera la primera vez. No afecta a sus datos, canales ni perfil.

### 4.2 RLS (Row Level Security) — la seguridad real del sistema

Cada tabla tiene políticas que filtran qué filas puede ver/editar cada usuario según su `auth.uid()`. El patrón repetido en casi todas las tablas es:

```sql
assigned_to = auth.uid()                          -- es suyo
OR assigned_to IN (SELECT get_team_ids(auth.uid())) -- o de su equipo
OR EXISTS (... role = 'admin')                      -- o es admin
```

**Bug recurrente a tener en cuenta:** cuando una operación de `UPDATE` no cumple la política RLS, Postgres/Supabase **no lanza un error** — el `UPDATE` simplemente afecta a 0 filas, y el código en React, si no comprueba explícitamente cuántas filas se actualizaron, asume que todo fue bien. Esto ya ha causado al menos un bug real en producción (la edición de usuarios en el panel de administración no se guardaba, sin ningún error visible, porque la política `profiles_update_own` no incluía la condición para directores). **Si algo "no se guarda" o "no se ve" sin dar ningún error, sospecha primero de RLS**, no de un fallo del código React.

**Fix aplicado (julio 2026):** las políticas de SELECT de `channel_interactions` y `channel_notes` originalmente solo permitían ver datos del propio usuario o de canales asignados directamente. Se corrigieron para incluir `get_team_ids(auth.uid())`, permitiendo que coordinadores, managers y directores vean las llamadas, emails, reuniones y notas de los canales de sus KAMs — no solo las visitas (que ya tenían esta política correcta desde el principio).

### 4.3 Funciones de Postgres (lógica de servidor)

| Función | Qué hace |
|---|---|
| `get_team_ids(manager_uuid)` | Devuelve los IDs de todo el equipo de un manager, calculado recursivamente vía `reports_to`. **Caso especial:** si `manager_uuid` tiene `role = 'director'`, devuelve **todos** los perfiles activos del sistema, ignorando la jerarquía — los directores ven todo. |
| `can_see_user(viewer_uuid, target_uuid)` | Helper booleano: ¿puede `viewer` ver a `target`? Se apoya en `get_team_ids`. |
| `handle_new_user()` | Trigger en `auth.users` (INSERT): crea automáticamente la fila correspondiente en `profiles` al registrarse alguien. **El rol por defecto es siempre `'kam'`** — si necesitas crear un manager/director, hay que cambiar el rol manualmente después desde el panel de administración. |
| `create_visit_followup_alert()` | Trigger en `visits` (INSERT/UPDATE): si una visita tiene `next_action_date` y `next_steps`, crea automáticamente una alerta de seguimiento (`alert_type = 'task'`) con prioridad calculada según cuán próxima sea la fecha. |
| `update_updated_at()` | Trigger genérico: actualiza el campo `updated_at` en cada UPDATE. |

### 4.4 El "bug del lock" de Supabase Auth (ya mitigado)

Supabase Auth usa un sistema de "lock" entre pestañas del navegador para coordinar el refresco del token de sesión. Cuando el navegador suspende una pestaña en background (móvil sobre todo: minimizar la app, bloquear pantalla), ese lock puede quedar "huérfano", y al volver al foco, `getSession()` se bloquea indefinidamente — causando un spinner infinito en toda la app.

Esto está mitigado en **dos capas**:
1. `frontend/src/lib/supabase.js` — el lock se desactiva explícitamente (`lock: (_name, _acquireTimeout, fn) => fn()`), para que cada pestaña gestione su token sin coordinación entre pestañas.
2. `frontend/src/hooks/useAuth.js` — lógica extensa de recuperación: timeout de seguridad en `getSession()`, lectura directa del token desde `localStorage` como respaldo, listener de `visibilitychange` para reintentar al volver al foco, y detección de "SIGNED_OUT falsos" (cuando el listener dispara un cierre de sesión que en realidad es ese bug, no un logout real).

**Si tocas `useAuth.js` en el futuro, hazlo con mucho cuidado** — cada pieza de ese archivo está ahí para resolver un síntoma específico de este bug, documentado en comentarios extensos dentro del propio archivo.

---

## 5. El backend Flask (Railway) — para qué sirve exactamente

El backend es deliberadamente pequeño (4 archivos Python, ~670 líneas en total) porque solo existe para lo que el frontend **no puede** hacer de forma segura por sí mismo (operaciones que requieren una clave secreta que nunca debe estar en el navegador).

| Endpoint | Para qué |
|---|---|
| `POST /api/assistant` | Proxy hacia la API de Claude (Anthropic) — esconde la API key, que nunca debe estar en el frontend |
| `POST /api/calendar-invite` | Envía invitaciones de calendario por email (SMTP) |
| `POST /api/reports/weekly` y la función interna `run_weekly_reports()` | Genera y envía el informe semanal a los managers (vía APScheduler, programado) |
| `GET /api/reports/preview/<manager_id>` | Vista previa del informe sin enviarlo |
| `POST /api/alerts/generate` | Genera alertas automáticas (probablemente las de "canal inactivo", "seguimiento atrasado", etc. — revisar `alerts.py`) |
| `GET /api/test/smtp` y `/api/test/report` | Endpoints de diagnóstico manual, no para uso normal |

### Problema conocido: SMTP bloqueado en Railway Hobby

Railway bloquea el tráfico SMTP saliente (puertos 465/587/25/2525) en los planes Free/Trial/**Hobby** — solo está disponible en el plan Pro. Esto afecta a `/api/calendar-invite` y al envío del informe semanal: **ambos fallan silenciosamente o con timeout**, no por un bug del código sino por una restricción de infraestructura de Railway. Hay dos soluciones posibles, sin decidir aún (ver sección 9): subir a Railway Pro, o sustituir el envío SMTP directo por un servicio HTTP como Resend o SendGrid.

---

## 6. Funcionalidades clave (cómo están construidas)

### 6.1 Gestión de usuarios (alta, baja, contraseña, MFA)

El módulo de administración de usuarios (`UserAdminPage.jsx`) centraliza toda la gestión del ciclo de vida de los usuarios. Accesible para directores y usuarios con `can_manage_users = true` (sección 6.6). Todas las operaciones sensibles pasan por la Edge Function `manage-users` en Supabase, que valida permisos y usa la `SERVICE_ROLE_KEY`.

**Alta de usuarios (acción `invite_user`):** el administrador crea al usuario con email, nombre, rol, zona, manager y una **contraseña temporal**. El sistema usa `auth.admin.createUser()` con `email_confirm: true` (sin enviar email de invitación, evitando la dependencia de SMTP y el problema conocido de redirección a localhost). El administrador comunica la contraseña al usuario por un canal seguro. El trigger `handle_new_user()` crea automáticamente la fila en `profiles`.

**Cambio de contraseña (acción `reset_password`):** desde el formulario de edición de cualquier usuario (lápiz → 🔑 Cambiar contraseña), el administrador puede establecer una nueva contraseña. Usa `auth.admin.updateUserById()`. No se permite resetear la propia contraseña por esta vía (para eso existe "¿Olvidaste tu contraseña?" en la pantalla de login).

**Reseteo de MFA (acción `reset_mfa`):** desde el mismo formulario de edición (lápiz → 📱 Resetear MFA), el administrador puede borrar los factores TOTP del usuario para forzar un re-enrollment. Usa `auth.admin.mfa.deleteFactor()`. Necesario cuando un usuario cambia de móvil o pierde acceso a su app autenticadora.

**Baja de usuarios (acción `deactivate_user`):** dado que 10 tablas distintas bloquean el borrado de un perfil con datos relacionados (sección 3), el sistema **nunca borra usuarios**. En su lugar:

1. El director elige "dar de baja" a un usuario desde `UserAdminPage.jsx`
2. Si el usuario tiene canales asignados, es obligatorio elegir un destinatario (cualquier otro usuario activo) antes de continuar
3. Una Edge Function de Supabase (`manage-users`, acción `deactivate_user`) reasigna esos canales y marca `profiles.is_active = false`
4. Se crea una alerta resumen (`alert_type = 'system'`) en el CRM avisando al destinatario, sin depender de email
5. `useAuth.js` comprueba `is_active` justo después de validar la contraseña en el login; si es `false`, fuerza el cierre de sesión y muestra "Usuario dado de baja"

**Reactivación de usuarios:** un usuario dado de baja puede ser reactivado desde el mismo módulo de administración: al pulsar el lápiz de edición sobre un usuario con la etiqueta "Dado de baja", el formulario muestra un botón verde "Reactivar" además de los campos habituales de edición. Al reactivar, se marca `is_active = true` directamente (sin Edge Function, usando la política RLS `profiles_update_own`), y el usuario podrá volver a iniciar sesión. Un aviso amarillo recuerda al administrador que los canales del usuario no se restauran automáticamente (fueron reasignados durante la baja) y que tendrá que asignarle canales manualmente desde la pantalla de Canales → Reasignar.

**Caso no resuelto:** si el usuario dado de baja tenía gente reportándole (`reports_to` apuntando a él), esa jerarquía no se toca automáticamente — queda como tarea pendiente para quien continúe el desarrollo.

### 6.2 Reasignación de canales

Dos mecanismos distintos para la misma operación de fondo (`channels.assigned_to`):
- **Individual**: componente `ChannelReassign` en la ficha de un canal — solo permite elegir entre usuarios `role = 'kam'`
- **Masiva**: `BulkReassignModal` (mismo archivo, `components/ChannelReassign.jsx`) — selector de canales por origen y destino. El campo "origen" incluye `kam`, `coordinator`, `manager` y `director` (se amplió recientemente para que un manager que ha heredado canales de una baja pueda repartirlos de nuevo)

### 6.3 Pipeline / Kanban

`PipelinePage.jsx` agrupa los canales en 7 columnas según `channels.status` (no según `pipeline_stage` directamente — hay una traducción intermedia vía `stageToStatus()` y `STATUS_TO_DEFAULT_STAGE` en el propio archivo). Al arrastrar un canal a otra columna, se recalcula también su `pipeline_stage` vía el mapeo inverso. Los colores de cada estado se importan de `STATUS_LIST` en `crmConstants.js` (fuente de verdad única para todos los colores del CRM).

**Motivo de descarte:** al arrastrar un canal a "Rechazado" o "Cierre sin acuerdo", aparece un popup obligatorio (`RejectReasonModal`) con motivos predefinidos según el estado y un campo opcional de información adicional. El motivo y el detalle se guardan juntos en `channels.rejection_reason`. Desde la ficha del canal, el motivo también se puede editar al cambiar la fase a `closed_no_deal` (aparece un campo rojo en el formulario de edición). Si el canal se reactiva (se mueve fuera de rechazo), el motivo se limpia automáticamente. El motivo se muestra como un recuadro rojo en la ficha del canal cuando está en estado rechazado/cierre.

### 6.4 Modo offline

`frontend/src/lib/offline.js` implementa una cola en IndexedDB: si el navegador está sin conexión, las operaciones de escritura (`insert`/`update`/`upsert`) se encolan en vez de fallar, y se sincronizan automáticamente en cuanto vuelve la conexión (evento `online` del navegador). Reintenta hasta 5 veces antes de abandonar una operación.

### 6.5 Notificaciones (campanita)

El componente `NotificationsBell` (dentro de `AppLayout.jsx`) muestra un icono de campana en la cabecera del CRM, con un contador rojo de alertas no leídas. Al pulsarla, despliega un panel con las 20 alertas más recientes (no descartadas), distinguiendo visualmente leídas de no leídas (punto de color + fondo resaltado). Al hacer clic en una alerta, se marca como leída.

Las alertas de tipo `system` generadas por una baja de usuario (título "Canales reasignados") incluyen además un botón "Repartir estos canales →" que abre directamente el `BulkReassignModal`, preseleccionando al propio usuario como origen, para que pueda redistribuir los canales heredados sin tener que navegar a la pantalla de Canales.

### 6.6 Acceso al módulo de administración (`can_manage_users`)

Por defecto, solo los usuarios con `role = 'director'` pueden acceder al módulo de administración de usuarios (crear, dar de baja, cambiar contraseña, resetear MFA, editar roles). El campo `can_manage_users` (boolean) en `profiles` permite conceder este mismo acceso a cualquier otro usuario sin cambiar su rol. Esto se comprueba en 4 puntos: `ProtectedRoute.jsx` (protección de ruta), `AppLayout.jsx` (visibilidad del enlace en el menú), `UserAdminPage.jsx` (control de acceso interno), y la Edge Function `manage-users` (validación en servidor — 4 acciones: `invite_user`, `reset_password`, `reset_mfa`, `deactivate_user`).

Para dar acceso de administración a un usuario sin que sea director:

```sql
UPDATE profiles SET can_manage_users = true WHERE full_name = 'Nombre del usuario';
```

La política RLS `profiles_update_own` también contempla `can_manage_users`, así que estos usuarios pueden editar perfiles de otros igual que un director.

### 6.7 Panel RVC (KPIs de seguimiento comercial)

Página `RvcPage.jsx`, accesible desde el menú del avatar (📈 RVC) para **todos los usuarios** sin restricción de rol. Incluye un selector de periodo temporal y KPIs organizados en dos bloques:

**KPIs principales:**

| KPI | Cálculo | Filtrado por periodo | Nota |
|---|---|---|---|
| Nº de leads proactivos identificados | Canales PUSH creados en el periodo | Sí | Solo canales con al menos un origen de lead PUSH |
| Tasa de éxito de leads | Canales PUSH con status `activo` / total canales PUSH creados × 100 | Sí | Solo canales PUSH |
| Captación nuevas EECC | Canales creados en el periodo con status `activo` | Sí | Todos los canales (sin filtro PUSH) |
| Visitas realizadas | Visitas con `checkin_at` dentro del periodo | Sí | |

Los orígenes de lead de tipo PUSH son: Evento, Congreso, Webinar, LinkedIn/Sales Navigator, Asociación sectorial, Páginas de empleo. Se identifican por el campo `group: 'push'` en `LEAD_SOURCE_OPTIONS` de `crmConstants.js`.

**Volumen negociado (desglosado por tipo, total canales activos sin filtro de periodo):**

| Tipo | Unidad | Color |
|---|---|---|
| Residencial | SWE+SWG | Azul |
| PYMEs | GWh | Violeta |
| CAEs | GWh | Verde |
| Solar | kWp | Amarillo |

Los KAMs ven solo sus propios datos; managers y directores ven los del equipo completo (controlado por RLS).

### 6.8 Selector de periodo compartido (`PeriodSelector`)

El componente `components/PeriodSelector.jsx` es un selector de periodo reutilizable, compartido actualmente por la página RVC y el Dashboard Manager. Incluye 7 presets (últimos 7/30 días, este/anterior mes, este/anterior trimestre, este año) más una opción **"Personalizado"** que despliega dos campos de fecha (desde/hasta) tipo calendario nativo del navegador, permitiendo al usuario elegir cualquier rango de fechas arbitrario.

El componente expone `period` (clave del preset activo), `range` (`{ from: Date, to: Date }`) y un callback `onChange(period, range)`. También exporta la función `getPeriodRange(key)` para calcular el rango de un preset desde fuera del componente.

El **Dashboard Manager** (`DashboardPage.jsx`) usa este mismo componente para filtrar visitas, interacciones y actividad del equipo por el periodo seleccionado (antes usaba un filtro fijo de "esta semana" sin selector visible).

### 6.9 Agenda con selector de KAM

`CalendarPage.jsx` muestra la agenda semanal con visitas planificadas, interacciones y visitas completadas. Los coordinadores, managers y directores ven un **selector desplegable de KAM** (mismo componente `KamSelector` que existe en PipelinePage) que permite ver "Todo el equipo" (mezclando agendas con el nombre del KAM en cada evento) o filtrar por un KAM específico. Los KAMs ven solo su propia agenda sin selector. La visibilidad real la controla RLS vía `get_team_ids()`.

### 6.10 Actas de reuniones

Componente `MeetingMinutes.jsx`, visible como una sección en la ficha del canal (entre "Actividad del canal" y "Volumen Anual Negociado"). Permite registrar actas de reuniones con: fecha, asistentes, notas/resumen y un documento adjunto (PDF, imagen, Word, Excel, PowerPoint). Los archivos se almacenan en el bucket de Supabase Storage `meeting-documents`. Cada acta muestra quién la subió y permite eliminarla (solo el autor o un director/admin). Los datos se guardan en la tabla `channel_meetings`.

### 6.11 Origen del lead (PULL / PUSH)

Al crear o editar un canal, el selector de "Origen del lead" agrupa las opciones en dos categorías visuales:

- **PULL** (cabecera azul): Recomendación partner, Industrial, Generación Distribuida, Canal Naturgy, KAM, Solicitud directa del canal
- **PUSH** (cabecera rosa): Evento, Congreso, Webinar, LinkedIn/Sales Navigator, Asociación sectorial, Páginas de empleo

Además, la opción **"Otros"** incluye un campo de texto libre que permite al usuario especificar la fuente. El texto se almacena como `"otros:texto libre"` dentro del array `lead_source` del canal (sin columna adicional en la BBDD). La clasificación PUSH es la que se usa para filtrar los KPIs 1 y 2 del panel RVC (sección 6.7).

### 6.12 Tipos de volumen (incluido Solar)

El selector de volumen en la ficha del canal (`VolumeEditor.jsx`) incluye 4 tipos: **Residencial** (SWE+SWG), **PYMEs** (GWh), **CAEs** (GWh) y **Solar** (kWp). Los tipos y sus colores se definen en `VOLUME_UNITS` tanto en `VolumeEditor.jsx` como en `crmConstants.js` (ambos sincronizados). Cada canal tiene un único tipo de volumen seleccionado (`volume_unit`) y un importe (`volume_amount`).

---

## 7. Deuda técnica conocida (cosas a vigilar)

### 7.1 Envío de emails roto

Railway bloquea SMTP saliente en el plan Hobby (sección 5). Esto afecta a las invitaciones de calendario y al informe semanal. Decisión pendiente: subir a Railway Pro, o sustituir SMTP directo por un servicio HTTP de email (Resend, SendGrid, Brevo). Esta decisión es independiente del 2FA (que usa TOTP y no necesita email).

### 7.2 Subordinados de usuario dado de baja

Si el usuario dado de baja tenía gente reportándole (`reports_to` apuntando a él), esa jerarquía no se toca automáticamente durante la baja — los subordinados se quedan con un manager inactivo hasta que alguien los reasigne manualmente desde el panel de administración.

### Deuda técnica resuelta recientemente

Los siguientes puntos se identificaron como deuda técnica y se resolvieron en la sesión del 19-21 de junio de 2026:

- **Colores duplicados entre archivos** — `STATUS_CONFIG`, `PIPELINE_STAGES` (en `crmConstants.js`), y copias locales en `PipelinePage.jsx` y `DashboardPage.jsx` usaban colores distintos e incoherentes entre sí. Se unificó todo en `crmConstants.js` como fuente de verdad única, y se eliminaron las copias locales. Si en el futuro se cambia un color, basta con cambiarlo en `crmConstants.js` y se refleja automáticamente en todo el CRM.
- **`schema.sql` desactualizado** — Solo contenía 5 tablas. Se regeneró con las 18 tablas reales de producción. Si en el futuro se añaden tablas directamente en Supabase, regenerar con la consulta de la sección 8.3.
- **Sin 2FA** — Implementado con TOTP (app autenticadora), obligatorio para todos los usuarios (sección 4.1).

---

## 8. Guía operativa — cómo se ha trabajado en este proyecto hasta ahora

Quien herede este proyecto probablemente seguirá un flujo similar al que se ha usado hasta ahora: **describir el problema o el cambio deseado a una IA (Claude), recibir el código completo del archivo modificado, y subirlo manualmente** vía el editor web de GitHub o el panel de Supabase, sin necesidad de un entorno de desarrollo local.

### 8.1 Cómo se sube un cambio de frontend

1. GitHub → repositorio `KAMSNC` → navegar a la ruta del archivo (ej. `frontend/src/pages/PipelinePage.jsx`)
2. Lápiz de "editar" → seleccionar todo el contenido → pegar el código nuevo completo
3. Hacer commit directamente en `main`
4. Netlify detecta el push y despliega automáticamente en 1-2 minutos — comprobar en `kamsnc.netlify.app` (forzar recarga con Ctrl+Shift+R si el navegador cachea la versión vieja)

Alternativa más rápida (usada en sesiones recientes): si se dispone de un token de acceso personal de GitHub (fine-grained, con permiso `Contents: Read and write` sobre el repo concreto), Claude puede clonar el repo, aplicar el cambio, hacer commit y `git push` directamente, sin pasar por el editor web. El token debe generarse con expiración corta (7-30 días) y revocarse cuando ya no se necesite.

### 8.2 Cómo se sube un cambio de backend

Similar, pero sobre el repositorio `KAMAPP`. Railway también tiene despliegue automático al detectar push en `main`.

### 8.3 Cómo se aplican cambios de base de datos

Todo se hace desde **Supabase → SQL Editor → New query**, pegando y ejecutando el SQL proporcionado. No hay sistema de migraciones formal (como Flyway o Prisma Migrate) — cada cambio de esquema se aplica como un script SQL suelto, ejecutado manualmente una vez. **Esto significa que no hay un historial versionado de cambios de esquema en ningún archivo** — la única fuente de verdad es el estado actual de la base de datos en Supabase.

Para regenerar un inventario actualizado del esquema completo (el archivo `database/schema.sql` del repo se actualizó el 19/06/2026, pero puede quedar desactualizado si se hacen cambios de esquema directamente en Supabase):

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Para ver las políticas RLS activas:

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Para ver las funciones de Postgres:

```sql
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public';
```

### 8.4 Cómo se aplican cambios de Edge Functions

Supabase → **Edge Functions** → seleccionar la función (ej. `manage-users`) → pestaña **Code** → sustituir el contenido completo → **Deploy**. Para depurar errores, la pestaña **Invocations** (no "Logs") muestra cada petición HTTP con su código de estado; el cuerpo exacto del error solo se ve fiablemente desde la consola del navegador (F12 → Red/Network → la petición → pestaña Respuesta), no desde el panel de Supabase.

### 8.5 Variables de entorno necesarias

**Frontend** (Netlify, configurado como variables de entorno del sitio):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Backend** (Railway, configurado como variables de entorno del servicio):
- Credenciales SMTP (host, puerto, usuario, contraseña) — actualmente sin efecto por el bloqueo de Railway, sección 5
- API key de Anthropic (para el proxy del Asistente)
- Credenciales de Supabase con permisos de servicio, si el backend necesita escribir directamente en la base de datos

**Edge Functions** (Supabase, configuradas en su propio panel): usan automáticamente la `SERVICE_ROLE_KEY` del proyecto, que tiene privilegios totales y nunca debe exponerse en el frontend.

---

## 9. Decisiones pendientes (aparcadas, no urgentes)

1. **SMTP roto en Railway** — elegir entre subir a Railway Pro o sustituir el envío directo por un servicio HTTP (Resend, SendGrid, Brevo). Esto afecta a las invitaciones de calendario por email y al envío del informe semanal automatizado. No afecta al 2FA (que usa TOTP sin email) ni a las alertas del CRM (que son internas y no dependen de email).

2. **Subordinados de usuario dado de baja** — cuando se da de baja a un usuario que tiene gente reportándole (`reports_to` → su id), los subordinados quedan con un manager inactivo. No hay ninguna lógica automática para reasignar esa jerarquía todavía — se gestionaría manualmente desde el panel de administración cambiando el `reports_to` de cada subordinado afectado.
