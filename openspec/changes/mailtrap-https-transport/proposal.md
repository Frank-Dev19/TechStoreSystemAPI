# Envío transaccional por Mailtrap HTTPS
El SMTP productivo falla por restricción de red. Incorporar transporte MAILTRAP_API seleccionado en entorno, con token exclusivo del servidor, sin migrar buzones ni modificar MX. Mantener remitentes, plantillas y adjuntos existentes. SMTP se conserva como opción explícita para desarrollo; no hay fallback automático que duplique envíos.
Rollback: MAIL_TRANSPORT=SMTP y recrear backend (SMTP seguirá sujeto al bloqueo de red).
