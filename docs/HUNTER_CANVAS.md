# Hunter Canvas en la ficha de canal

El panel existente evoluciona a Hunter Canvas. Conserva la memoria por canal, el endpoint /api/assistant y la detección de Benchmark sobre aportaciones del KAM, nunca sobre las respuestas generadas.

El prompt adapta Superprompt Agente Hunter Canvas v3 aportado por el usuario. Conserva los ocho bloques y el razonamiento de sinergia. Se ajusta para leer el contexto autorizado del CRM, retomar cuentas existentes, permitir accesos directos, reducir el brainstorming por defecto y distinguir Documentado, Aportado por el KAM, Hipótesis y GAP. Se eliminan garantías comerciales implícitas: ni recurrencia ni rentabilidades, plazos o porcentajes se presuponen.

## Documentos

- Hunter Canvas: ocho bloques, tesis y evidencia con fuentes. Word editable.
- Preparación de reunión: diez secciones inspiradas en la estructura del ejemplo THERMABEAD (lectura, mapa, propuesta, guion, preguntas, objeciones, cierre, acuerdos, cualificación y checklist). No incluye sus datos como contexto de otras cuentas. Word editable, descargable por separado.
- La respuesta JSON debe validarse antes de mostrar un borrador. El usuario puede editar textos, fuentes y etiquetas. Requiere marcar revisión antes de descargar/guardar.
- Guardar el Canvas reutiliza business_cases con document_type hunter_canvas y el bucket privado business-cases. Si existe otro documento, se pide confirmación. No se borra el archivo antiguo del bucket; este cambio no ofrece todavía un navegador de versiones históricas.
- Se evita upsert: un alta concurrente no se pisa. La sustitución comprueba updated_at. Si falla la escritura de metadatos, se intenta retirar exclusivamente el archivo recién subido.
- El texto guardado señala que fue generado con asistencia de IA y conserva etiquetas. Guardar no convierte hipótesis en hechos ni altera acciones, estados ni clasificaciones.
- El guion no sustituye al Canvas. El documento anterior subido sigue accesible desde la ficha hasta que el usuario confirme su sustitución.

## Alcance y limitaciones

No requiere migración nueva. Requiere las tablas, columna extracted_text, document_type y permisos privados ya existentes para Hunter Canvas. Se respetan sus políticas RLS; no se amplían permisos.

El panel recupera una ventana reciente con límites visibles. Los errores de consulta y actas ilegibles se muestran como lectura parcial. No se incorpora OCR ni búsqueda nueva. El Business Case sigue aportando solo metadatos cuando no hay extracción legible. No hay memoria ilimitada ni estado estructurado de fases persistido: se retoma con conversación y contexto disponibles.

Los documentos nuevos se generan en el navegador con docx, cargado bajo demanda. No se almacenan hasta que el usuario pulsa Guardar. El borrador es temporal; el cierre avisa si hay uno abierto. Para incorporar al agente un Canvas recién guardado se cierra y reabre el panel.

Next Best Action no cambia su acción registrada ni su implementación; puede aprovechar el Canvas adjunto mediante el contexto común ya existente. El nuevo método Hunter se aplica en este panel, no sustituye el prompt de Next Best Action ni del asistente general.

## Validación

- node --test frontend/src/lib/hunterCanvas.test.mjs frontend/src/lib/saveHunterCanvas.test.mjs
- npm run build --prefix frontend
- Word de ocho bloques y Word de reunión generados con datos ficticios de QA, renderizados e inspeccionados (tres páginas cada uno).

Se han verificado estructura JSON, rechazo de respuestas incompletas, etiquetas, nombres seguros, generación OOXML, confirmación de sustitución, concurrencia y limpieza tras errores mediante mocks. No se han ejecutado consultas reales de IA ni guardado documentos en producción. Debe comprobarse después del despliegue una cuenta CAEs y otra de Nuevos Negocios con permisos reales.
