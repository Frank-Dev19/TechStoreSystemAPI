# Tasks: grouped-service-agreement-billing

## Phase 1 — Sales Domain Contract
- [x] 1.1 Definir DTO/contrato backend para crear una venta desde múltiples acuerdos.
- [x] 1.2 Definir contrato para contribuyente fiscal separado del cliente operativo.
- [x] 1.3 Definir snapshot fiscal inmutable de la venta.

## Phase 2 — Grouped Billing Use Case
- [x] 2.1 Implementar validación de acuerdos del mismo cliente operativo.
- [x] 2.2 Implementar creación de una venta con múltiples líneas por acuerdo.
- [x] 2.3 Implementar bloqueo de pagos parciales dentro de un acuerdo.
- [x] 2.4 Persistir vínculos venta ↔ acuerdo/orden con cobertura total por acuerdo.
- [x] 2.5 Persistir contribuyente fiscal y snapshot fiscal.

## Phase 3 — Economic Workflow / Delivery
- [x] 3.1 Recalcular estado económico por orden con la nueva venta agrupada.
- [x] 3.2 Ajustar la validación de entrega para exigir cobertura total del acuerdo de la orden.
- [x] 3.3 Asegurar que una orden cubierta pueda entregarse aunque otras del mismo cliente sigan pendientes.

## Phase 4 — Backend Tests
- [x] 4.1 Agregar tests del caso de uso de venta agrupada.
- [x] 4.2 Agregar tests para rechazo de mezcla de clientes y parcialidad por acuerdo.
- [x] 4.3 Agregar tests para snapshot fiscal y contribuyente distinto del cliente operativo.
- [x] 4.4 Agregar tests para gating de entrega por cobertura individual.

## Phase 5 — Verification
- [x] 5.1 Ejecutar tests focalizados del dominio de ventas/acuerdos/entrega.
- [x] 5.2 Ejecutar type-check/lint focalizado si aplica.
- [x] 5.3 Actualizar apply-progress y artifacts de verificación.

