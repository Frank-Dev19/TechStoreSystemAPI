# Change Proposal: batch-service-order-creation

## Intent
Agregar soporte backend para crear múltiples órdenes de servicio individuales en una sola operación, preservando la trazabilidad y reglas de dominio de cada orden.

## Scope
- Contrato backend para creación batch de órdenes.
- Aplicación/service layer para persistir N órdenes individuales en una sola operación coherente.
- Reutilización de snapshots, validaciones y reglas por orden sin degradar la independencia de cada registro.

## Explicit Clarifications
- No se introduce una “orden grupal”.
- Cada orden mantiene su propio ciclo operativo/comercial/económico.
- Este change complementa la facturación agrupada ya implementada y no la reemplaza.

## Decisions Already Closed
- Debe existir un contrato explícito de creación múltiple.
- La creación batch conserva trazabilidad individual por orden.
- El backend no debe depender de que frontend dispare N creates sueltos sin semántica transaccional.

## Approach
Introducir un endpoint/contrato batch que reciba contexto compartido más una colección de entradas por equipo. El servicio backend transformará cada entrada en una orden individual, aplicando las reglas actuales de creación de service orders y devolviendo la colección creada con sus IDs y códigos propios.

## Risk Level
Medio-Alto, porque toca la frontera contractual principal de `service-orders` y debe evitar inconsistencias parciales entre órdenes creadas en una misma sesión.

## Capabilities
- New: batch-service-order-creation
- Modified: service-order-management
