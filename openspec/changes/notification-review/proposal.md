# Revisar notificaciones fallidas

Agregar Ignorar para sacar una notificación FAILED_FINAL de pendientes sin eliminar errores ni intentos. El estado IGNORED no será reintentado ni listado. Usar transición condicional para evitar carreras con Reintentar. Mantener autorización admin/supervisor y auditoría existentes.

La VPS almacena los timestamps automáticos en UTC, pero el driver usa -05:00 y desplaza su lectura. Exponer lastAttemptAt a partir del último intento guardado con representación UTC explícita; UI muestra Perú (-05:00). No cambiar globalmente fechas de otras entidades ni registros históricos.

Sin migraciones. Rollback: revertir consumidores; conservar registros IGNORED. No enviar mensajes ni ignorar registros de producción como parte de las pruebas.
