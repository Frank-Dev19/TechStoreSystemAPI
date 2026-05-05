## Implementation Progress

**Change**: `document-type-client-kind`  
**Mode**: Strict TDD

### Completed Tasks
- [x] 1.1 Modify `TechStoreSystemAPI/src/catalogs/document-types/entities/document-type.entity.ts` to add `kind = PERSON | COMPANY`.
- [x] 1.2 Modify `TechStoreSystemAPI/src/catalogs/document-types/dto/create-document-type.dto.ts` to require `kind`.
- [x] 1.3 Modify `TechStoreSystemAPI/src/catalogs/document-types/dto/update-document-type.dto.ts` so updates can include `kind`.
- [x] 2.1 RED: extend `TechStoreSystemAPI/src/catalogs/document-types/document-types.service.spec.ts` for create/update/read with `kind`.
- [x] 2.2 GREEN: modify `TechStoreSystemAPI/src/catalogs/document-types/document-types.service.ts` to persist and return `kind`.
- [x] 2.3 RED: extend `TechStoreSystemAPI/src/catalogs/document-types/document-types.controller.spec.ts` if needed to validate request/response contract with `kind`.
- [x] 3.1 Verify duplicate, soft-delete, and restore flows remain valid after adding `kind`.
- [x] 3.2 Decide and document temporary behavior for legacy `document_types` rows without backfill.
- [x] 3.3 Review the backend contract exposed to APP so `documentType.kind` is the primary source for consumers.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\entities\document-type-kind.enum.ts` | Created | Added `PERSON` / `COMPANY` enum for document type classification. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\entities\document-type.entity.ts` | Modified | Added nullable enum column `kind` for transitional rollout. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\dto\create-document-type.dto.ts` | Modified | Required `kind` with enum validation on create. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.ts` | Modified | Explicitly persisted and updated `kind`. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.spec.ts` | Modified | Replaced broken placeholder spec with repository-backed behavior tests. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.controller.spec.ts` | Modified | Replaced broken placeholder spec with controller forwarding tests for `kind`. |

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.spec.ts` | Unit | ⚠️ Pre-existing failure in placeholder spec was replaced as part of this change | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 2.2 | `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.spec.ts` | Unit | ✅ Same spec after RED | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 2.3 | `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.controller.spec.ts` | Unit | ⚠️ Pre-existing failure in placeholder spec was replaced as part of this change | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |

### Test Summary
- **Total tests written**: 11
- **Total tests passing**: 11
- **Layers used**: Unit (11), Integration (0), E2E (0)
- **Approval tests**: None
- **Pure functions created**: 0

### Deviations from Design
- `kind` quedó `nullable` en la entidad para tolerar rows legacy durante la transición; create sigue exigiéndolo por DTO.

### Legacy Transition Decision
- Durante la transición, las filas legacy de `document_types` pueden devolverse con `kind = null`.
- APP debe usar `documentType.kind` como fuente principal y caer al fallback legado solo cuando `kind` sea `null`.
- El backfill de catálogo queda desacoplado de este rollout funcional.

### Issues Found
- Los specs originales de `document-types` estaban rotos por dependencia no mockeada del repository; se reemplazaron por tests reales.

### Remaining Tasks
- None.

### Status
9/9 tasks complete. Ready for verify.
