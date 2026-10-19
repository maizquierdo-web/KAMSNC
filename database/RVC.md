# RVC: criterios y aplicación

Periodo: semestres naturales en Europe/Madrid, desde el inicio incluido hasta el inicio del semestre siguiente excluido.

- Leads: canales creados en el semestre con algún origen PUSH. Cada canal cuenta una vez.
- «Otros» se considera PUSH, tanto `otros` como `otros:descripción`. Se aplica a los datos existentes sin reescritura. La clasificación se comparte con el pipeline; no se deduce un origen para canales sin informar.
- Éxito: esos leads actualmente activos / esos leads × 100; sin leads, 0 %.
- Captación: esos mismos leads PUSH actualmente activos. Se conserva expresamente la fecha de creación, no la fecha de activación.
- Volumen: todos los canales actualmente activos, separados por unidad, sin filtro de semestre.
- Canales y volumen se atribuyen a assigned_to actual. Visitas a kam_id original; el coordinador que cierra administrativamente no recibe la visita.
- Visita elegible: check-in en el semestre, GPS verificado y coordenadas válidas; estado en ese momento distinto de activo o en_proceso_alta. No se exige checkout.
- El paso posterior a Activo no elimina visitas anteriores elegibles.
- Se mantienen los perfiles activos y exclusiones nominales del RVC anterior, bajo los permisos RLS actuales. No es un cierre histórico de plantilla ni de cartera.

## Datos históricos

El trigger captura el estado de nuevas visitas al insertar un check-in reciente. Ni el cierre ni una actualización ordinaria pueden sobrescribirlo. Visitas retroactivas/sin conexión sincronizadas más tarde quedan sin snapshot: el estado actual no prueba el estado pasado.

Para visitas sin snapshot, la pantalla busca el cambio de fase anterior al check-in, o el origen del siguiente cambio. Se considera reconstrucción provisional. Huecos detectables, fases desconocidas o ausencia de historial quedan pendientes y no suman. No se presupone que el historial de producción esté completo. Se muestran tanto las reconstruidas como las pendientes para revisión individual.

Por ello NO se puede prometer exactitud histórica hasta contrastar los casos con Supabase y confirmar la integridad del historial. La migración no rellena estados antiguos por conjetura ni modifica las visitas existentes.

## Orden de aplicación

1. Revisar y autorizar la migración 20261015_rvc_visit_status_snapshot.sql en Supabase.
2. Aplicar la migración antes de publicar el frontend: la pantalla nueva necesita la columna.
3. Contrastar el desglose por gestor con las visitas reales y revisar los casos históricos señalados.

## Validación

`node --test frontend/src/lib/rvc.test.mjs`

`npm run build --prefix frontend`

La migración se ha ejecutado en PostgreSQL embebido (PGlite) sobre un esquema mínimo: ejecución repetida, captura en servidor, imposibilidad de sobrescribir el snapshot en un cierre, conservación tras activación y ausencia de estado inventado para check-ins retroactivos. No es una prueba en la base de producción ni valida sus políticas RLS.
