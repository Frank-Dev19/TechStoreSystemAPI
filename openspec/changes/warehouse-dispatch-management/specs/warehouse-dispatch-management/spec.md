# Gestión de despachos de almacén

## ADDED Requirements

### Requirement: Solicitud digital de insumo

Un técnico MUST poder solicitar un producto, cantidad y motivo. La solicitud MUST quedar atribuida al usuario autenticado y MUST NOT descontar inventario antes del despacho.

#### Scenario: Solicitud pendiente

- GIVEN un técnico autenticado y un producto activo
- WHEN registra una solicitud válida
- THEN aparece una solicitud `INTERNAL_SUPPLY` pendiente para recepción y el stock no cambia.

### Requirement: Reemplazo por garantía

Al aceptar una garantía con resolución `FACTORY_REPLACEMENT`, el sistema MUST crear una solicitud por el producto exacto de la cobertura, mantener la cobertura reservada e inmovilizar la serie original como `UNDER_REVIEW`.

#### Scenario: Diagnóstico por falla de fábrica

- GIVEN una cobertura reservada vinculada a producto
- WHEN el técnico registra que la garantía aplica por falla de fábrica
- THEN se crea una única solicitud de reemplazo, no se consume la cobertura y no se incrementa stock.

### Requirement: Despacho atómico

Recepción MUST poder despachar una solicitud pendiente con selección válida de lote o series. El movimiento OUT, la guía y el cambio de estado MUST confirmarse en una sola transacción e idempotentemente.

#### Scenario: Reintento de despacho

- GIVEN una clave de operación ya aplicada
- WHEN recepción reintenta los mismos datos
- THEN obtiene el resultado original sin un segundo movimiento.

### Requirement: Confirmación del reemplazo

El técnico asignado MUST confirmar el reemplazo entregado. Solo entonces la cobertura MUST consumirse y el reclamo MUST resolverse.

### Requirement: Cola y resumen

Recepción MUST disponer de vistas paginadas para materiales de orden, insumos internos, reemplazos e historial. Un resumen MUST exponer los conteos pendientes de los tres orígenes para la campana.

### Requirement: Kardex legible

Las salidas MUST mostrarse en español como material de orden de servicio, insumo interno o reemplazo por garantía, conservando los códigos internos para auditoría.
