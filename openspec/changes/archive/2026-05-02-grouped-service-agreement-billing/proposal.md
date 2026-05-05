# Change Proposal: grouped-service-agreement-billing

## Intent
Soportar backend para emitir un solo comprobante desde múltiples acuerdos de servicio del mismo cliente operativo, sin pagos parciales por acuerdo y con contribuyente fiscal separado del cliente operativo.

## Scope
- Crear venta agrupada desde múltiples acuerdos.
- Generar una línea facturable por acuerdo.
- Persistir relación venta <-> acuerdos/órdenes seleccionados.
- Persistir cliente contribuyente y snapshot fiscal inmutable.
- Ajustar regla de entrega por cobertura total del acuerdo de cada orden.

## Decisions Already Closed
- Un acuerdo se paga total o no se incluye.
- No existe saldo parcial dentro de un acuerdo.
- Las líneas del comprobante no se consolidan entre acuerdos aunque repitan concepto o producto.
- El contribuyente fiscal se define al vender, no se edita después de emitir.

## Approach
Agregar un caso de uso de venta agrupada basado en múltiples acuerdos elegibles del mismo cliente operativo, validando homogeneidad fiscal del comprobante, cobertura total por acuerdo y persistencia de snapshot fiscal. Reutilizar el esquema actual de sale links por orden/acuerdo como base de reconciliación.

## Risk Level
Medio-Alto.

## Capabilities
- New: grouped-service-agreement-billing
- Modified: sales-domain-billing
- Modified: service-order-economic-workflow
