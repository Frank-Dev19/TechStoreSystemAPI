# Technical Design: batch-service-order-creation (API)

## Summary
Este cambio agrega un caso de uso backend para crear múltiples service orders individuales en una sola operación, reutilizando las reglas actuales de creación por orden pero exponiendo un contrato batch explícito.

## Architecture Decisions

### 1. Batch create is a first-class use case
No se debe simular creación múltiple ejecutando N `create()` sueltos desde frontend. El backend debe modelar un caso de uso batch explícito con su propio DTO y endpoint.

### 2. Shared context is expanded into many independent orders
El backend recibe:
- contexto compartido
- muchas entradas por orden

y expande eso en N órdenes individuales, aplicando a cada una:
- snapshots de cliente/contacto
- reglas de validación
- código único
- estados iniciales canónicos

### 3. Single-order creation rules remain the source of truth
La lógica batch no debe duplicar reglas de negocio innecesariamente. Debe reutilizar o extraer la lógica de creación individual para no abrir divergencia entre:
- create unitario
- create batch

### 4. Response must preserve mapping and traceability
La respuesta debe devolver las órdenes creadas individualmente, con datos suficientes para que el frontend pueda:
- mostrar resultados
- saber qué se creó
- enlazar cada resultado con el candidato original si hace falta

### 5. Downstream workflows remain per-order
El backend no introduce una entidad grupal nueva. Cada orden creada batch entra al sistema igual que una orden creada individualmente:
- acuerdos posteriores por orden
- diagnóstico por orden
- facturación por orden o agrupada luego desde ventas
- entrega por orden

## Contract Shape
El request debe distinguir:
- `sharedContext`
- `orders[]`

El response debe devolver:
- `createdOrders[]`
- cada una con su `id`, `code` y datos relevantes de seguimiento

## File Impact (API)
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\service-orders\dto\create-service-order.dto.ts` o DTO batch nuevo relacionado
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\service-orders\controllers\service-order.controller.ts`
- `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\service-orders\services\service-order.service.ts`
- tests del controller/service de service orders

## Risks
- duplicación accidental de reglas entre create simple y create batch
- resultados parciales ambiguos si no se define bien la consistencia de la operación
- crecimiento de complejidad del DTO si no se separa bien shared context de order entries
