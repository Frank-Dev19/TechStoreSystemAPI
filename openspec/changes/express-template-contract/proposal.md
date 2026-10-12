# Contrato de plantilla Express

Meta rechazó el resumen Express con error 132000 porque producción usaba la plantilla de recepción de tres parámetros mientras el sistema enviaba cuatro. La plantilla aprobada orden_express_confirmada contiene documento PDF y cuatro variables, sin botones.

Corregir exclusivamente el constructor Express y la configuración WHATSAPP_TEMPLATE_STANDARD_ORDER_NAME. Diagnóstico, recotización y recepción conservan sus contratos. No modificar plantillas aprobadas ni emitir mensajes de prueba reales durante despliegue. Las notificaciones ya creadas mantienen el snapshot original para auditoría; su recuperación requiere revisar ese payload.

Rollback: restaurar imagen/configuración previas, conservando registros de envío. Sin cambios de esquema.
