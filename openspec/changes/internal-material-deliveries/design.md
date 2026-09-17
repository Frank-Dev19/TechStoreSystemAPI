# Diseño

Guía por equipo y versión aprobada; detalles por serie (o cantidad para no serializados), movimiento de origen, devolución y uso. Un registro de conciliación identifica la versión vigente y asigna las entregas utilizadas a sus líneas, permitiendo recotizar sin duplicar salidas. La guía original es inmutable.

La condición USABLE/UNDER_REVIEW/UNUSABLE es independiente de IN_STOCK/ISSUED/LOST. Stock representa existencia física en almacén; unidades bloqueadas se excluyen de disponibilidad y selección. La devolución física registra entrada incluso con falla; revisar condición no genera otra entrada.

Orden bloqueada antes de equipo, y producto antes de stock/serie. Venta y operaciones de material comparten bloqueo de orden. Idempotencia por clave de operación y hash de payload; repetición idéntica no duplica movimientos. Una devolución mantiene costo/lote/serie original.

Venta de servicio requiere conciliación vigente, cantidades exactas y origen no facturado. Persiste snapshot de entregas/series por línea; las rutas de venta directa conservan sus movimientos. Anular venta de servicio no devuelve material físico.

Secuencia: aprobación → entrega seleccionada por almacén → salida → técnico confirma uso / almacén recibe devolución → conciliación exacta → venta con origen heredado. Un cambio comercial se resuelve en cotizaciones existentes; no se decide automáticamente crear otra orden.

Permisos: leer según acceso a orden, entregar/devolver con inventory-manage.manage, confirmar uso con acceso técnico a la orden; revisar condición exclusivamente admin. No se crea rol de logística.

## Integration with incoming warranty coverage (2026-09-08)

Upstream develop bd8a071 introduces warranty issuance on sale. Service sales claim their material sources and then issue coverages in the same transaction; they do not register a second stock OUT. Warranties consume materialSources per sale item when present, preserving the exact serial even when multiple items share a product. Direct sales retain the existing movement-based lookup. Upstream service-order warranty intake and diagnosis rules are preserved.
