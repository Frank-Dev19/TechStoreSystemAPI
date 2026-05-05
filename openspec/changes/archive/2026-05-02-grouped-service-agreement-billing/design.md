# Technical Design: grouped-service-agreement-billing

## Summary
Este cambio agrega un caso de uso backend para emitir una venta desde múltiples acuerdos de servicio del mismo cliente operativo, manteniendo acuerdos individuales por orden, una línea facturable por acuerdo, y reglas de entrega por cobertura total de cada acuerdo.

## Architecture Decisions

### 1. Reuse sale-to-order/agreement links as reconciliation backbone
Se reutiliza la infraestructura existente de `ServiceOrderSaleLink` para reflejar qué órdenes/acuerdos quedaron cubiertos por la venta agrupada.

### 2. Persist one sale, many order/agreement links
La venta es una sola entidad `Sale`, pero se crean múltiples vínculos `ServiceOrderSaleLink`, uno por acuerdo/orden seleccionada.

### 3. Persist taxpayer separately from operational client context
La venta debe guardar referencia al contribuyente fiscal usado para emitir, y además un snapshot fiscal inmutable. El cliente operativo de las órdenes no alcanza como source of truth del comprobante.

### 4. Delivery gating moves to economic coverage validation
La entrega ya no puede depender solo del estado operativo cuando la venta agrupada existe; debe validar que el acuerdo de la orden esté completamente reconciliado.

## Domain Flow
1. Backend recibe selección de acuerdos pendientes del mismo cliente operativo.
2. Valida homogeneidad del conjunto.
3. Resuelve/crea contribuyente fiscal.
4. Construye una venta con muchas líneas `SERVICE`, una por acuerdo.
5. Persiste snapshot fiscal en la venta.
6. Crea `ServiceOrderSaleLink` por cada acuerdo seleccionado con cobertura total.
7. Recalcula estado económico por orden.
8. Entrega futura valida cobertura total de la orden específica.

## API Responsibilities
- Nuevo DTO/endpoint o extensión explícita del flujo de ventas para agrupación por acuerdos.
- Validación de same operational client.
- Validación de pago total por acuerdo incluido.
- Creación de líneas de venta por acuerdo.
- Persistencia de taxpayer + snapshot fiscal.
- Ajuste de `markAsDelivered` o equivalente para bloquear órdenes no totalmente cubiertas.

## Data Considerations
- `Sale` hoy sigue persistiendo `companyId`; queda como legado fuera de alcance del rediseño funcional.
- `Sale` hoy referencia `customerId`; el cambio probablemente requerirá distinguir mejor contribuyente fiscal vs contexto operativo.
- `Sale` hoy no evidencia snapshot fiscal dedicado en la entidad actual; el cambio necesita incorporarlo o una estructura equivalente.

## File Impact (API)
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\sales\dto\*.ts`
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\sales\services\sales.service.ts`
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\sales\entities\sale.entity.ts`
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\service-orders\services\service-order-sale-link.service.ts`
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\service-orders\services\service-order.service.ts`
- controladores/dtos relacionados a ventas desde órdenes y/o nueva facturación agrupada

## Risks
- Cambiar el modelo de venta sin romper venta manual o venta desde una sola orden.
- Resolver snapshot fiscal correctamente sin generar duplicación inconsistente.
- Endurecer la entrega sin bloquear órdenes antiguas o legacy mal reconciliadas.

## Open Questions
- Ninguna bloqueante. `companyId` se reconoce como legado técnico aún presente pero fuera del rediseño funcional.
