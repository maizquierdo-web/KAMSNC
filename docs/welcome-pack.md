# Welcome pack CAE en KAMSNC

Esta entrega implementa la preparación dentro de la ficha de canal del CRM. No depende de Nexo ni incorpora un transporte de correo.

## Activación

1. Aplicar `database/migrations/20261123_channel_welcome_pack.sql` en el SQL Editor de Supabase. No se ha aplicado desde el desarrollo.
2. Aplicar después `database/migrations/20261123_welcome_pack_desktop_handoff.sql` para actualizar el texto del historial. No requiere permisos de Microsoft ni conexión al buzón.
3. Desplegar el frontend junto con `public/welcome-pack/mask.docx` y `natureco.docx`.
4. En un canal con estado `activo` y fase `active`, abrir **Preparar welcome pack**.

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

## Envío desde la aplicación de correo

Se conserva el asistente de cuatro pasos. En «Correo y adjuntos» se descarga un ZIP con el Word y únicamente los documentos operativos realmente disponibles. Extraer el ZIP, abrir el correo y adjuntar los archivos manualmente. El enlace mailto prepara destinatario, asunto y texto en la aplicación predeterminada (Outlook si está configurado). No permite elegir la cuenta remitente: el usuario debe comprobar que coincide con su correo del CRM.

Si el texto supera el umbral conservador del enlace, se abre destinatario y asunto y se indica usar «Copiar texto» para pegarlo. Si no hay aplicación configurada, se puede crear el mensaje manualmente usando los datos del diálogo. No se integran Microsoft Graph, Entra ni credenciales de correo.

El CRM registra **Correo preparado**, nunca «Enviado». El registro significa que se preparó el mensaje, incluso si el cliente no llega a abrirse. No confirma entrega ni apertura.

## Prueba y documentación pendiente

Faltan los documentos A, B y procedimiento de preoferta OCA, además del directorio validado de contactos OT/verificadora. Mientras falten, el ZIP contiene un Word marcado BORRADOR y un LEEME con pendientes; el asunto lleva [PRUEBA]. El texto enumera solo los archivos disponibles. Para probar, confirmar como destinatario una dirección propia. No utilizar este borrador como pack operativo definitivo.

Al incorporar los documentos definitivos, actualizar su manifiesto en welcomePack.mjs con disponibilidad y URL reales. Completar los contactos en el diálogo. La generación descargará todos los archivos de esa modalidad; si alguno falla, se muestra error y no se descarga un pack parcial.

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

## Corrección de apertura y correo descargable

Aplicar `20261123_welcome_pack_search_path_fix.sql` después de las migraciones anteriores. Mantiene SECURITY INVOKER y RLS y fija el esquema public para que las funciones/políticas existentes encuentren profiles. Validar con un usuario autorizado y otro sin acceso en Supabase.

Los contactos de OT1, OT2 y verificadora contienen persona y correo, sin teléfono; los teléfonos antiguos no se muestran ni se incluyen en el Word.

«Descargar correo (.eml)» genera un MIME con texto UTF-8 y archivos disponibles adjuntos, sin depender del guardado del borrador. Comprueba que el canal sigue activo antes de generar. No registra envío. Outlook puede abrirlo como mensaje y requerir Reenviar, dependiendo de la versión. «Abrir correo» conserva el comportamiento mailto y requiere guardado correcto.
