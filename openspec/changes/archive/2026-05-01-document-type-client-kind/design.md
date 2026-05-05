# Design: DocumentType client kind classification (API)

## Technical Approach

El backend va a extender `document_types` con un campo `kind` (`PERSON | COMPANY`), exponerlo en DTOs y respuestas del catálogo, y sostener compatibilidad transitoria para filas existentes no backfilleadas.

## Architecture Decisions

### Decision: modelar `kind` dentro de `document_types`
**Choice**: persistir la clasificación en la entidad del catálogo.
**Alternatives considered**: seguir infiriendo en consumidores o agregar tabla separada.
**Rationale**: la clasificación pertenece al catálogo y debe viajar en su contrato.

### Decision: reutilizar el patrón actual de service/controller
**Choice**: extender `DocumentType`, DTOs y `DocumentTypesService` sin introducir capa nueva.
**Alternatives considered**: refactor más profundo del módulo de catálogos.
**Rationale**: el módulo ya tiene create/find/update/restore y el cambio es contractual, no estructural.

### Decision: tolerancia transitoria para rows legacy
**Choice**: permitir que consumidores manejen `kind` faltante durante transición.
**Alternatives considered**: exigir backfill completo antes del rollout.
**Rationale**: reduce riesgo operacional y desacopla despliegue de migración.

## Data Flow

`create/update document type` → DTO validates `kind` → `DocumentTypesService` persists entity

`findAll/findOne` → entity includes `kind` → APP catalog consumers resolve PERSON/COMPANY

legacy row without `kind` → response may expose null/empty per migration strategy → APP fallback

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\entities\document-type.entity.ts` | Modify | Add `kind` column. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\dto\create-document-type.dto.ts` | Modify | Require `kind`. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\dto\update-document-type.dto.ts` | Modify | Allow updating `kind`. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.ts` | Modify | Persist and return classified catalog. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.service.spec.ts` | Modify | Add behavior tests for kind. |
| `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPI\src\catalogs\document-types\document-types.controller.spec.ts` | Modify | Validate request/response contract if covered there. |

## Interfaces / Contracts

```ts
export enum DocumentTypeKind {
  PERSON = 'PERSON',
  COMPANY = 'COMPANY',
}

export class CreateDocumentTypeDto {
  name: string;
  digits: number;
  description: string;
  kind: DocumentTypeKind;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | DTO/service create with kind | Jest spec for create/update/find contract |
| Unit | Duplicate/restore flows keep working with kind | Extend current service spec |
| Integration | None | Not installed/required for this scope |

## Migration / Rollout

Requires data migration/backfill strategy for existing `document_types` rows. If migration is not immediate, backend responses remain consumable because legacy rows can still return `kind = null`, and APP consumers explicitly apply the documented transitional fallback only in that case.

## Open Questions

- [ ] ¿La migración de base de datos se hace en este mismo change o se coordina fuera del scope de openspec?
- [x] ¿Se devuelve `null` para rows legacy o se backfillea antes de exponer el contrato nuevo? → Durante la transición se devuelve `null`; create exige `kind` y los consumidores usan fallback solo para esas filas legacy.
