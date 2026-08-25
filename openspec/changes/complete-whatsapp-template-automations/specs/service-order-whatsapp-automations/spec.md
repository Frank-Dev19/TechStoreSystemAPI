# Automatizaciones WhatsApp de órdenes

## Requisitos

### Venta de una sola orden
El sistema MUST rechazar una venta de servicio que contenga cero o más de una orden y MUST conservar la lectura de comprobantes históricos agrupados.

#### Escenario: intento de venta agrupada
- GIVEN dos órdenes elegibles
- WHEN se intenta crear una sola venta con ambas
- THEN la operación MUST fallar antes de crear la venta

### Recordatorio de cotización
El sistema MUST enviar como máximo un recordatorio por versión comercial vigente `ISSUED`, sin decisión, una vez superada la demora configurada.

#### Escenario: versión todavía pendiente
- GIVEN una versión vigente emitida hace al menos 48 horas
- WHEN se ejecuta el scheduler
- THEN se MUST enviar la plantilla con el mismo PDF y registrar una clave idempotente por versión

### Comprobante aceptado
El sistema MUST enviar un comprobante solo después de que SUNAT lo acepte y MUST adjuntar el PDF oficial del proveedor.

#### Escenario: comprobante aceptado
- GIVEN una venta ligada a una única orden
- WHEN SUNAT responde `ACCEPTED`
- THEN se MUST publicar temporalmente el PDF oficial y enviar una plantilla idempotente por documento

### Recordatorio de recojo
El sistema MUST enviar un recordatorio automático consolidado por orden y MAY permitir un envío manual por subconjunto de equipos elegibles.

#### Escenario: recojo parcial urgente
- GIVEN equipos listos o cancelados todavía no entregados
- WHEN un operador autorizado selecciona algunos equipos
- THEN se MUST enviar un único PDF con esos equipos y registrar el evento auditable

### Reintentos
El sistema MUST conservar el payload completo y MUST reintentar los fallos transitorios hasta tres veces con demoras configurables.

#### Escenario: agotamiento de reintentos
- GIVEN una notificación que falla en los tres reintentos automáticos
- WHEN se agota la política
- THEN su estado MUST ser `FAILED_FINAL` y un supervisor MUST poder reintentarla manualmente
