# Tasks: Órdenes de servicio con múltiples equipos (API)

## 1. Infraestructura y migración de esquema

- [ ] 1.1 RED: agregar pruebas de integración MySQL para el preflight destructivo y preservación de datos fuera del dominio de órdenes.
- [x] 1.2 GREEN: crear la migración protegida por `ALLOW_SERVICE_ORDER_DATA_RESET=true`, eliminando solo datos y vínculos definidos por el spec.
- [ ] 1.3 RED: cubrir restricciones, FKs, índices de serie normalizada y correlativo diario concurrente.
- [ ] 1.4 GREEN: crear entidades y tablas de cabecera, items, secuencia, cancelación, comercial y lecturas de inbox.
- [ ] 1.5 REFACTOR: centralizar nombres de tablas, columnas y enums; validar `migration:run`, `migration:show` y `migration:revert` sobre una base descartable.

## 2. Creación agregada y códigos

- [x] 2.1 RED: especificar DTO de una cabecera con `items[]`, prioridad `LOW`, un solo tipo de servicio y rechazo de arrays vacíos.
- [x] 2.1.1 RED: especificar que la cabecera no acepta ni expone prioridad y que cada ítem conserva la propia.
- [x] 2.1.2 Eliminar `service_orders.priority`, sus consumidores legacy y el filtro de cabecera mediante una migración reversible.
- [x] 2.1.3 Mover métricas y SLA sensibles a prioridad al ítem individual.
- [x] 2.1.4 Retirar columnas y estadísticas de prioridad/equipo del listado de recepción y agregar el modal `Ver equipos`.
- [x] 2.2 GREEN: reemplazar creación batch por creación agregada transaccional con secuencia `America/Lima`.
- [x] 2.3 RED: cubrir rollback cuando falla cualquier item, evento, proyección o comercial inicial.
- [ ] 2.4 GREEN: devolver cabecera e items con códigos padre/hijo y retirar el uso interno del contrato batch.
- [ ] 2.5 REFACTOR: separar generador de código, factory de items y proyector agregado del servicio principal.

## 3. Lectura, alcance y PDF

- [x] 3.1 RED: cubrir listados paginados de cabeceras con resumen de items y detalle con colección completa.
- [x] 3.2 GREEN: implementar queries tipadas, filtros por estados agregados y alcance de técnico asignado.
- [x] 3.3 RED: cubrir un único PDF con múltiples equipos en orden de código hijo.
- [x] 3.4 GREEN: adaptar el generador de recepción y eliminar generación repetida por equipo.

## 4. Ciclo técnico por equipo

- [x] 4.1 RED: cubrir transiciones independientes, estados parciales y bloqueo global de ejecución comercial.
- [x] 4.2 GREEN: implementar workflow por item con lock de cabecera y proyección en la misma transacción.
- [x] 4.3 RED: cubrir reasignación común y rechazo de cualquier override técnico por item.
- [x] 4.4 GREEN: adaptar balance de carga, eventos y SLA para una asignación de cabecera con trabajo por item.

## 5. Diagnóstico y rediagnóstico

- [x] 5.1 RED: cubrir diagnóstico ligado obligatoriamente a item y restricción por técnico asignado.
- [x] 5.2 GREEN: migrar servicios, DTO y controladores de diagnóstico a `serviceOrderItemId`.
- [x] 5.3 RED: cubrir rediagnóstico derivado de la última versión aceptada solo para el item afectado.
- [x] 5.4 GREEN: implementar linaje por item sin reabrir versiones aceptadas de hermanos.

## 6. Comercial, decisiones y descuentos

- [x] 6.1 RED: cubrir versiones comerciales de item, consolidado global y conservación de aceptaciones sin cambios.
- [x] 6.2 GREEN: implementar entidades y servicios de versiones, líneas unificadas y revisiones consolidadas.
- [x] 6.3 RED: cubrir decisiones append-only con actor, canal, fecha, versión exacta y alcance del técnico.
- [x] 6.4 GREEN: exponer endpoints para emitir revisión y registrar decisiones manuales.
- [x] 6.5 RED: cubrir descuentos dentro del límite, override supervisado y snapshot inmutable.
- [x] 6.6 GREEN: integrar pricing/descuentos con líneas comerciales y permisos de técnico, recepción y supervisor.
- [x] 6.7 RED: comprobar que ninguna mutación comercial arma ni envía texto libre por WhatsApp.

## 7. Cancelación y entrega parcial

- [x] 7.1 RED: cubrir cancelación autoaprobada antes de ejecución y solicitud pendiente después de iniciada.
- [x] 7.2 GREEN: implementar solicitud/resolución auditada y permisos separados de cancelación tardía.
- [x] 7.3 RED: cubrir aprobación sin cobro, con ajuste comercial y rechazo con restauración del estado previo.
- [x] 7.4 GREEN: implementar ajustes y bloqueo de reducción cuando existe venta confirmada sin revertir.
- [x] 7.5 RED: cubrir entrega parcial solo con cobertura económica global total o exonerada.
- [x] 7.6 GREEN: implementar entrega por item y proyección parcial/final de cabecera.
- [x] 7.7 RED: cubrir cancelación múltiple atómica, constancia obligatoria y cargo fijo de S/ 20 desde diagnóstico.
- [x] 7.8 GREEN: implementar cancelación inmediata por lote y acuerdo confirmado consolidado pendiente de pago.
- [x] 7.9 REFACTOR: conservar resolución solo para solicitudes legacy y unificar la selección nueva en el modal compartido de los tres paneles.
- [x] 7.10 RED/GREEN: separar cancelación de devolución física, conservar `CANCELADA` al entregar y bloquear únicamente cancelaciones con cargo pendiente.
- [x] 7.11 RED/GREEN: entregar varios equipos atómicamente, conservar compatibilidad individual y enviar encuesta solo al completar toda la devolución física.
- [x] 7.12 REFACTOR: rehidratar el técnico en respuestas proyectadas sin modificar asignación, sugerencias ni balances.

## 8. Ventas y economía

- [ ] 8.1 RED: cubrir facturación de acuerdo global vigente, rechazo de revisiones obsoletas y snapshots por código de item.
- [ ] 8.2 GREEN: adaptar creación individual y agrupada de ventas sin fusionar líneas de equipos distintos.
- [ ] 8.3 RED: cubrir preservación de descuentos aceptados sin recálculo en la venta.
- [ ] 8.4 GREEN: copiar snapshots comerciales y recalcular cobertura global de orden en la transacción.
- [ ] 8.5 RED: cubrir bloqueo de cancelación facturada hasta reversión de la venta completa, incluida la venta agrupada.

## 9. Garantía por serie

- [ ] 9.1 RED: cubrir búsqueda normalizada con cero, una y varias coincidencias.
- [ ] 9.2 GREEN: implementar endpoint de candidatos y referencia opcional `warrantySourceItemId`.
- [ ] 9.3 RED: cubrir que coincidencia, fecha o vigencia informativa no deciden el resultado de garantía.
- [ ] 9.4 GREEN: adaptar creación y diagnóstico de garantía al item origen opcional.

## 10. Inbox centrado en cliente

- [ ] 10.1 RED: cubrir ausencia de asociaciones mensaje-orden e hilo-orden en entrada y salida.
- [ ] 10.2 GREEN: retirar entidades, repositorios, DTO y backfill de vínculos; resolver órdenes recientes por cliente.
- [ ] 10.3 RED: cubrir visibilidad para todo usuario con permiso y lectura independiente entre dos usuarios del mismo rol.
- [ ] 10.4 GREEN: implementar recibos por usuario y mantener invalidación SSE sin datos sensibles.

## 11. Permisos y compatibilidad

- [ ] 11.1 RED: cubrir permisos por transición, entrega, cancelación, decisión, descuento y override.
- [ ] 11.2 GREEN: actualizar catálogo/grants sin modificar autorización general de ventas, caja o inventario.
- [ ] 11.3 RED: cubrir rechazo del técnico no asignado y alcance transversal de recepción/supervisión.
- [ ] 11.4 GREEN: retirar rutas y wrappers legacy que contradigan el nuevo contrato cuando el frontend ya no los use.

## 12. Verificación

- [x] 12.1 Ejecutar pruebas Jest focalizadas después de cada corte RED/GREEN.
- [ ] 12.2 Ejecutar `npm run test`, `npm run lint:check`, `npx tsc --noEmit`, `npm run build` y `git diff --check`.
- [ ] 12.3 Ejecutar integración real con MySQL para locks, correlativos, rollbacks y migración destructiva protegida.
- [ ] 12.4 Comparar la implementación contra cada escenario de los specs y registrar resultados en `verify-report.md`.
- [ ] 12.5 Ejecutar checklist E2E manual de wizard, paneles, comercial, cancelación, entrega, garantía e inbox; no marcar completo sin evidencia de una ejecución real.
