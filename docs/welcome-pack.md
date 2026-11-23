# Welcome pack CAE en KAMSNC

Esta entrega implementa la preparación dentro de la ficha de canal del CRM. No depende de Nexo ni incorpora un transporte de correo.

## Activación

1. Aplicar `database/migrations/20261123_channel_welcome_pack.sql` en el SQL Editor de Supabase. No se ha aplicado desde el desarrollo.
2. Desplegar el frontend junto con `public/welcome-pack/mask.docx` y `natureco.docx`.
3. En un canal con estado `activo` y fase `active`, abrir **Preparar welcome pack**.

La migración es transaccional y se puede ejecutar de nuevo. Añade dos columnas a canales, una tabla con borradores por canal/usuario y una función de guardado. Respeta las RLS de canales y notas; no amplía los permisos de acceso del CRM. El remitente se obtiene del JWT, nunca de un campo enviado por el navegador. Cada escritura comprueba ACTIVO con bloqueo de fila. El código no almacena contraseñas ni credenciales de correo.

## Recorrido

- Remitente: usuario autenticado; destinatario editable y confirmación obligatoria en cada apertura.
- Datos ausentes: se completan en el diálogo. Guardar o cerrar no obliga a volver a la ficha. El cierre conserva datos en memoria; **Guardar borrador** los persiste en Supabase.
- Selección múltiple de fichas por código con búsqueda y posibilidad de añadir otro código. Los códigos conocidos son sugerencias y no un catálogo técnico completo. Se exige al menos uno para preparar.
- No se asigna RES010/RES020/RES022 automáticamente. Se recuperan las fichas guardadas y códigos explícitos en clasificación.
- Los datos del KAM asignado son independientes del usuario remitente. Su edición se limita al pack, no modifica el perfil del KAM.
- Modalidad: Máscara/frontal/Smartfy → Sanwa/Sanwa/OCA + A; Natureco → SinCO2/SinCO2/OCA + B; Natureco Promotor+OT → propia empresa/SinCO2/OCA + B y procedimiento OCA.
- Se conservan asignaciones excepcionales conocidas; cualquier nueva excepción requiere motivo. Cambiar modalidad propone las asignaciones estándar salvo excepción explícita.
- Guardar datos en la ficha es opcional. No sustituye el email habitual por el destinatario puntual y no cambia el responsable asignado.
- Word: usa la plantilla de Judith, ampliada con KAM, OT1/OT2, fichas y bloque operativo. La variante máscara omite el acceso directo a Natureco. Siempre se descarga como **BORRADOR · NO ENVIAR AL CANAL** durante esta fase.
- **Registrar preparación** crea una nota en el historial indicando **PREPARADO · NO ENVIADO**. Ni esta acción ni una descarga equivalen a enviar un correo.

## Pendiente antes de habilitar envío

- Documentos A, B y procedimiento de preoferta OCA validados por Negocio/Dani, con nombres y versiones definitivos.
- Contactos validados de OT y verificadora; automatizar su directorio. Los contactos pueden completarse durante la preparación.
- Confirmar instrucciones de acceso para los usuarios de cada modalidad.
- Integrar la cuenta autorizada de correo del usuario (por ejemplo, un proveedor corporativo), con envío y adjuntos reales desde servidor, control de duplicados, reintentos, estado del proveedor y trazabilidad de envío.
- Implementar la validación completa de todos los datos/adjuntos desde servidor justo antes del envío. Nunca habilitarlo quitando únicamente el atributo disabled del botón.

## Comprobación manual con Supabase

- Verificar que el botón está ausente en Pendiente, Contactado, Negociación, Alta, Rechazado y Cierre.
- Completar datos ausentes sin cerrar; seleccionar y deseleccionar varias fichas; exigir al menos una.
- Probar las tres modalidades y una excepción; verificar Word y listado/texto del correo.
- Confirmar un destinatario alternativo; comprobar que no cambia `channels.email`.
- Guardar borrador, cerrar, recargar y retomarlo; probar error de red y comprobar que los datos introducidos permanecen.
- Guardar preparación y comprobar nota en historial sin incrementar actividades de email enviado.
- Cambiar el canal a otra fase desde otra sesión antes de guardar: la RPC debe rechazar la operación.
- Probar con usuario ajeno al canal: las RLS deben impedir leer/actualizar borradores y la RPC no debe actualizar el canal.

Las pruebas automatizadas cubren elegibilidad, datos ausentes, asignaciones, selección múltiple, correo condicional y generación de Word en las tres modalidades. Las RLS y la RPC requieren las comprobaciones anteriores sobre una base de pruebas; no se ha ejecutado SQL contra producción.
