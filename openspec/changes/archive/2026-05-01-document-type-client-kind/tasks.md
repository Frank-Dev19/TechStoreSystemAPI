# Tasks: DocumentType client kind classification (API)

## Phase 1: Catalog contract foundation
- [x] 1.1 Modify `TechStoreSystemAPI/src/catalogs/document-types/entities/document-type.entity.ts` to add `kind = PERSON | COMPANY`.
- [x] 1.2 Modify `TechStoreSystemAPI/src/catalogs/document-types/dto/create-document-type.dto.ts` to require `kind`.
- [x] 1.3 Modify `TechStoreSystemAPI/src/catalogs/document-types/dto/update-document-type.dto.ts` so updates can include `kind`.

## Phase 2: Behavior and tests
- [x] 2.1 RED: extend `TechStoreSystemAPI/src/catalogs/document-types/document-types.service.spec.ts` for create/update/read with `kind`.
- [x] 2.2 GREEN: modify `TechStoreSystemAPI/src/catalogs/document-types/document-types.service.ts` to persist and return `kind`.
- [x] 2.3 RED: extend `TechStoreSystemAPI/src/catalogs/document-types/document-types.controller.spec.ts` if needed to validate request/response contract with `kind`.

## Phase 3: Transition / verification
- [x] 3.1 Verify duplicate, soft-delete, and restore flows remain valid after adding `kind`.
- [x] 3.2 Decide and document temporary behavior for legacy `document_types` rows without backfill.
- [x] 3.3 Review the backend contract exposed to APP so `documentType.kind` is the primary source for consumers.
