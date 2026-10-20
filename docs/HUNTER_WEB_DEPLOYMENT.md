# Hunter: consulta web y preguntas de una en una

El frontend añade una consulta pública explícita mediante el botón «Buscar información pública de la empresa». Solo envía el nombre de la empresa; nunca el contexto de actas, notas ni conversación a la herramienta de búsqueda. El servidor reconstruye el prompt y limita las consultas a tres por petición. La investigación muestra enlaces citados y fecha de consulta, se puede retirar y se incorpora al contexto de la sesión y a la generación del documento. No se guarda automáticamente en Supabase ni Benchmark.

El prompt maestro original se conserva íntegro. Una actualización posterior, autorizada por el usuario, sustituye sus instrucciones incompatibles: una pregunta por turno, sin listas ni subpreguntas, y posibilidad de usar información web pública con fuentes. Las respuestas deben distinguir lo publicado de las hipótesis. El arranque pregunta únicamente por la empresa. El cumplimiento conversacional lo guía el modelo; no hay una prueba real de IA que garantice su comportamiento en todos los turnos.

## Cambio necesario en KAMAPP

Aplicar `docs/integrations/kamapp-hunter-web.patch` en una rama del repositorio `rfranzaalvarez/KAMAPP`, basado en el commit `3b596532da381e8ad60809788c7132db30d22ea6` (revisar si ha cambiado antes de aplicar):

```
git apply --check /ruta/kamapp-hunter-web.patch
git apply /ruta/kamapp-hunter-web.patch
python -m unittest test_hunter_assistant.py
```

Publicar el servidor antes del frontend. Se reutiliza ANTHROPIC_API_KEY, sin claves en navegador y sin modificaciones de Supabase. Debe estar disponible la herramienta web_search_20250305 para la cuenta de Anthropic y tener crédito; es una operación facturada por el proveedor. Referencia: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool

La respuesta del servidor lleva `hunter_web_search_enabled: true`; si falta (servidor antiguo) el frontend muestra que hay que publicar KAMAPP, nunca presenta una búsqueda simulada. Si no hay citas válidas o la respuesta se corta, no incorpora la investigación.

El servidor mantiene el presupuesto anterior (1000 tokens) para otras funciones. Para modo hunter_canvas permite 4096 tokens, incluidos documentos; para investigación, 2500 y un máximo de tres búsquedas. Se amplía timeout de petición a 90 s para Hunter y de Gunicorn a 120 s para evitar matar el proceso durante la consulta. No se modifica el modelo existente.

## Verificación

- 13 pruebas de frontend: prompt original íntegro, regla de una pregunta, petición pública mínima, bloqueo sin soporte del servidor, citas y enlaces seguros, documentos y guardado existentes.
- 3 pruebas unitarias del constructor de peticiones del servidor: ninguna nota/prompt del CRM llega al modo investigación, herramientas limitadas, errores de nombre y compatibilidad con otras llamadas.
- Compilación del frontend y compilación Python correctas. No se ha realizado una consulta real a Anthropic ni desplegado el servidor. La prueba de la ruta Flask requiere instalar las dependencias del repositorio y queda pendiente.

GitHub rechazó escribir en KAMAPP con 403 `Resource not accessible by integration`. Por ello este parche está preparado pero no publicado en el repositorio del servidor.
