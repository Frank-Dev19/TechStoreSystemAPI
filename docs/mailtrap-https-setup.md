# Mailtrap: correo transaccional por HTTPS

## Arquitectura
MAIL_TRANSPORT=SMTP (predeterminado) conserva instalaciones existentes. MAIL_TRANSPORT=MAILTRAP_API usa exclusivamente https://send.api.mailtrap.io/api/send por 443 para facturación, recuperación de contraseña y documentos de órdenes que pasan por MailerService. No hay fallback automático ni reintento automático: ante timeout comprobar registros antes de repetir. Se conservan mensajes, remitentes y adjuntos (PDF/XML/CDR codificados en base64). El token es de servidor, nunca se expone a Angular ni se guarda en logs/vault. No requiere migración de base de datos.

## Preparación de la cuenta
1. Crear o acceder a Mailtrap y elegir Email Sending/Transactional, no Email Sandbox.
2. Agregar macrochips.com en Sending Domains.
3. Copiar exactamente los registros DNS indicados por Mailtrap al proveedor DNS autoritativo. Si es cPanel, usar Zone Editor. No asumir que cPanel es autoritativo solo por alojar el correo.
4. Mantener los MX de recepción existentes de cPanel. No crear registros SPF duplicados; revisar y consolidar según instrucciones del proveedor si corresponde. No sustituir políticas DMARC existentes sin evaluar el cambio.
5. Esperar verificación DNS y aprobación/compliance del dominio. El dominio autorizado permite usar remitentes corporativos; los buzones y respuestas siguen en cPanel.
6. Generar token de envío limitado al dominio, con privilegios mínimos. No pegarlo en el chat ni en Git. Guardarlo en gestor de secretos y en el entorno privado del backend.

## Activación
En el archivo privado de entorno que consume el backend:

    MAIL_TRANSPORT=MAILTRAP_API
    MAILTRAP_API_TOKEN=<token privado de envío>

Mantener MAIL_FROM y la configuración de identidad de cada perfil. La base de datos prevalece sobre los remitentes de entorno si ya existen perfiles guardados. No usar las credenciales SMTP de Mailtrap en lugar del token API.

Desplegar en orden GitHub → Docker Hub → VPS, y recrear backend tras cambiar el entorno. Actualizar frontend para mostrar el modo API. Renovar resolución del upstream Nginx si cambia la IP del backend. No activar producción hasta tener dominio aprobado y token preparado.

## Pruebas manuales
1. Admin → Correo: comprobar que muestra Mailtrap y no pide contraseña SMTP.
2. Configurar remitente bajo el dominio verificado en ambos perfiles.
3. Indicar un destinatario de prueba propio: el botón envía un correo real (no un sandbox). Una aceptación API no garantiza llegada a bandeja de entrada.
4. Revisar recepción, spam y registros de Mailtrap. Confirmar reply-to.
5. Probar comprobante con PDF/XML/CDR y resumen de orden PDF, verificando que abren correctamente.
6. Probar recuperación de contraseña y que el enlace funciona.
7. Verificar que desactivar un perfil sigue bloqueando sus envíos.

## Errores y operación
- 401: token inválido o revocado.
- 403: revisar dominio aprobado y permisos del token.
- 429: límite/cuota/rate limit; revisar Mailtrap, no repetir masivamente.
- Timeout: el proveedor puede haber aceptado el mensaje; revisar registros antes de reintentar.
- Token ausente: error inmediato, sin fallback SMTP.

Timeout HTTP 15 segundos. SMTP conserva límites de conexión/saludo de 10 segundos y socket de 20 segundos. Revisar consumo diario y mensual en Mailtrap: el plan gratuito limita ambos; no se presume que sea ilimitado.

## Rollback
MAIL_TRANSPORT=SMTP y recrear backend restaura el transporte anterior, pero en DigitalOcean SMTP sigue sujeto al bloqueo diagnosticado. No revertir DNS/MX de recepción ni borrar credenciales antiguas durante la puesta en marcha.

## Referencias
- https://docs.mailtrap.io/developers/email-sending/transactional
- https://docs.mailtrap.io/email-api-smtp/setup/sending-domain
- https://docs.digitalocean.com/support/why-is-smtp-blocked/

## Estado de preparación (2026-10-15)
El usuario creó la cuenta corporativa y verificó macrochips.com (DNS, sender information y compliance). Token de envío guardado de forma privada en /opt/macrochips/secrets/backend.env, con MAIL_TRANSPORT=MAILTRAP_API. Presencia verificada sin mostrar el valor. Contenedor aún no recreado; integración pendiente de despliegue y prueba real. No confundir preparación del archivo con activación del transporte.
