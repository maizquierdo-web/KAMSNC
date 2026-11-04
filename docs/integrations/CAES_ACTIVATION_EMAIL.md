# Aviso interno de activación CAEs

## Comportamiento

- Destinatario: mhugle@naturgy.com. Copia al usuario que activa la cuenta, obtenido
  de auth.users.email, nunca del responsable asignado.
- Remitente previsto: maizquierdo@naturgy.com mediante su conexión de Outlook.
- Solo transición desde no activo a Activo en canales CAEs. Una edición posterior
  no reenvía. Una reactivación tras desactivar genera otro aviso.
- No incluye pedido, plataforma ni enlace. No envía onboarding al canal.
- Cuatro campos opcionales: nombre/correo del contacto de OT y nombre/correo del
  verificador. La ficha muestra los de OT cuando hay oficina asignada. Conservan
  los permisos existentes, incluidos los de Marina, y no bloquean activación.
  El contacto del verificador solo se solicita para el rol Promotor + OT
  (promoter_ot), también en el aviso a Marina. No se borra al cambiar de rol.
  Pendiente recibir el catálogo de contactos para sustituir los textos por dos
  desplegables (OT y verificador), completando nombre y correo al seleccionar.
- Conserva la notificación interna existente de la campana.

## Despliegue

1. Ejecutar database/migrations/20261104_caes_activation_email.sql en el proyecto
   correcto. No modifica estados, contactos ni activaciones anteriores.
2. Integrar y desplegar frontend DESPUÉS de la migración.
3. Conectar el flujo siguiente. La migración por sí sola NO envía correos.
4. Probar activación en entorno de prueba, comprobar destinatario y CC antes de
   habilitar producción. No se ha ejecutado ninguna migración remota desde este cambio.

## Power Automate

Requiere conexión Office 365 Outlook de Miguel y acción HTTP, según licencia y
políticas de la organización. Crear flujo programado cada minuto con concurrencia 1.
El administrador debe guardar la credencial service_role de Supabase en la conexión
segura autorizada, con entradas/salidas seguras. Nunca en git, VITE ni navegador.
La credencial es privilegiada y no debe compartirse con los KAMs.

### Reclamar aviso

Acción HTTP llamada Reclamar_aviso:

- POST https://<PROJECT_REF>.supabase.co/rest/v1/rpc/claim_caes_activation_email
- Headers: apikey = credencial segura; Authorization = Bearer <SERVICE_ROLE_KEY>;
  Content-Type = application/json.
- Cuerpo: {}.
- Si greater(length(body('Reclamar_aviso')), 0), Compose llamado Aviso con
  first(body('Reclamar_aviso')). Si la respuesta está vacía, terminar sin enviar.

### Enviar

Office 365 Outlook, «Enviar un correo electrónico (V2)», usando la conexión
maizquierdo@naturgy.com. Guardar sender_email no concede permisos Send As. Otra
conexión requeriría delegación autorizada en Exchange.

- Para: outputs('Aviso')?['recipient_email']
- CC: outputs('Aviso')?['cc_email']
- Asunto: outputs('Aviso')?['subject']
- Cuerpo HTML: escapar el texto almacenado antes de convertir saltos de línea:

```
replace(replace(replace(replace(outputs('Aviso')?['body'], '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), decodeUriComponent('%0A'), '<br>')
```

Desactivar reintentos automáticos del envío. No tomar direcciones desde el frontend.

### Confirmar

Tras éxito de Outlook, POST a
https://<PROJECT_REF>.supabase.co/rest/v1/rpc/finish_caes_activation_email
con los mismos headers y JSON estructurado:

```
{
  "p_id": "<id de Aviso>",
  "p_claim_token": "<claim_token de Aviso>",
  "p_sent": true,
  "p_error": null
}
```

Comprobar respuesta true. Para un fallo conocido de Outlook, ejecutar con p_sent
false y p_error descriptivo mediante la rama «ejecutar después de error».
Si hay timeout o no se sabe si Outlook aceptó el envío, conservar processing y
revisar Enviados antes de reintentar. Si falla la confirmación DESPUÉS de enviar,
NO volver a ejecutar el envío.

## Supervisión

La cola y las funciones de envío son exclusivas de service_role. Un usuario del
CRM no puede leerlas ni reclamar avisos. Si falta el email del actor, el mensaje
queda blocked; no inventa una CC ni bloquea la activación. Cambios por servicios o
importaciones sin auth.uid() no generan mensajes.

Consultar como administrador:

```
select id, channel_id, actor_id, recipient_email, cc_email, status,
       created_at, claimed_at, sent_at, last_error
from public.caes_activation_emails order by created_at desc;
```

Las reclamaciones concurrentes no reciben el mismo aviso. No se reenvían
ciegamente failed/blocked/processing. El administrador debe reconciliar con Outlook
antes de devolverlos a pending. No se promete entrega exactamente una vez ante un
fallo entre el proveedor y la confirmación. sent significa aceptación de la acción
de envío, no lectura ni ausencia de rebotes. No borrar la cola para reintentar.

## Referencias oficiales

- https://learn.microsoft.com/en-us/connectors/office365connector/
- https://supabase.com/docs/guides/database/functions
