# Tasks: rediagnosis-agreement-versioning

## Phase 1: Contrato y base persistente

- [x] 1.1 RED `src/service-orders/service-agreements/service-agreements.service.spec.ts`: cubrir draft derivado desde el último `CONFIRMED` activo sólo para órdenes que ya tuvieron acuerdo confirmado y llegaron a ejecución antes del rediagnóstico.
- [x] 1.2 Modificar `src/service-orders/service-agreements/entities/service-agreement.entity.ts` para agregar `derivedFromAgreementId`; NO agregar `supersededByAgreementId`.
- [x] 1.3 Modificar `src/service-orders/service-agreements/entities/service-agreement-product.entity.ts` y `entities/service-agreement-service-item.entity.ts` para persistir `provenance` y `derivedFrom...ItemId` de líneas heredadas.
- [x] 1.4 Modificar `dto/create-service-agreement.dto.ts`, `dto/update-service-agreement.dto.ts`, `dto/service-agreement-*.dto.ts` para exponer `baseAgreementId`, `technicalServiceAmount`, `newProducts`, permisos y metadata de herencia.

## Phase 2: Reglas de versionado derivado

- [x] 2.1 GREEN `src/service-orders/service-agreements/service-agreements.service.ts`: clonar acuerdo vigente en `create()`, copiar líneas/notas heredadas, setear lineage y rechazar derivación fuera del caso de rediagnóstico en ejecución.
- [x] 2.2 RED `src/service-orders/service-agreements/service-agreements.service.spec.ts`: rechazar edición/eliminación de heredadas no técnicas y permitir sólo cambio de monto en la heredada `TECHNICAL_SERVICE`.
- [x] 2.3 GREEN `src/service-orders/service-agreements/service-agreements.service.ts`: en `update()` aceptar sólo `technicalServiceAmount`, `notes` como texto propio de la nueva versión y `newProducts`; mantener intacto lo heredado.
- [x] 2.4 RED `src/service-orders/service-agreements/service-agreements.service.spec.ts` y `service-agreements.controller.spec.ts`: confirmar que `confirm()` supersede la versión previa y que lecturas aguas abajo devuelven la nueva activa.
- [x] 2.5 GREEN `src/service-orders/service-agreements/service-agreements.service.ts` y `service-agreements.controller.ts`: serializar `derivedFromAgreementId`, `provenance`, `canEdit`, `canDelete` y resolver siempre la versión vigente.

## Phase 3: Verificación y cierre

- [x] 3.1 REFACTOR `src/service-orders/service-agreements/service-agreements.service.ts` y specs para consolidar helpers de clonación/permisos sin romper los escenarios del spec.
- [x] 3.2 Completar `src/service-orders/service-agreements/service-agreements.service.spec.ts` con escenarios de Given/When/Then para latest active, excepción técnica y supersedencia al confirmar.
