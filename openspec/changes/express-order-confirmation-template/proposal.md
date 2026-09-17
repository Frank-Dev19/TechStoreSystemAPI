# Plantilla de confirmación para órdenes Express

Las órdenes Express registran y aceptan su alcance comercial durante la recepción, pero actualmente envían el mismo resumen genérico que una orden de diagnóstico. Se requiere una plantilla Utility propia que informe el total ya autorizado sin solicitar una segunda aceptación.

## Alcance

- Seleccionar `orden_express_confirmada` al notificar el alta de una orden `STANDARD_SERVICE`.
- Enviar nombre del cliente, código, cantidad de equipos y total autorizado.
- Mantener el resumen de recepción para los demás tipos de servicio.
- Conservar el envío después del commit y la idempotencia existente.

## Rollback

Restaurar la selección única de `resumen_de_orden_de_servicio`; los registros de notificación existentes permanecen legibles.
