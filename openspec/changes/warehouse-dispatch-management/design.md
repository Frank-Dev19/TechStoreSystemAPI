# Diseño

## Decisiones

- `MaterialDelivery` continúa representando la salida física confirmada.
- `DispatchRequest` representa una intención pendiente para `INTERNAL_SUPPLY` o `WARRANTY_REPLACEMENT`; no duplica cotizaciones de órdenes.
- La cola de materiales de orden se obtiene del flujo comercial existente. Las otras dos colas se obtienen de `DispatchRequest`.
- La campana muestra acciones pendientes y se actualiza consultando un resumen; no introduce un segundo sistema de notificaciones.
- Un reemplazo solicita exactamente el producto cubierto. Elegir equivalentes queda fuera de este cambio porque requiere una política comercial explícita.
- La serie defectuosa pasa a `UNDER_REVIEW` y no genera una entrada de inventario.
- La cobertura de un reemplazo permanece reservada hasta que el técnico confirma recepción/aplicación.
- Se preservan los endpoints manuales existentes para compatibilidad, pero la nueva interfaz usa solicitudes digitales.

## Estados

`PENDING -> DELIVERED -> CONFIRMED`

`PENDING -> REJECTED`

Solo los reemplazos requieren `CONFIRMED`; un insumo interno queda confirmado al despacharse.

## Seguridad

- Técnico: `dispatches.request-internal`, `dispatches.confirm-replacement`.
- Recepción: `dispatches.read`, `dispatches.fulfill`, `dispatches.reject`.
- Administrador conserva acceso por la política administrativa existente.
