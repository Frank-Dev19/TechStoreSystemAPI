# Proposal: DocumentType client kind classification

## Intent

Agregar `DocumentType.kind` como contrato explícito del catálogo backend para reemplazar la inferencia transitoria por nombre/dígitos y sostener correctamente los flujos `PERSON` / `COMPANY` que dependen de `Client.kind`.

## Scope

### In Scope
- Agregar `kind = PERSON | COMPANY` a la entidad `document_types`.
- Exponer `kind` en create/update/read de `document-types`.
- Mantener fallback transitorio del lado consumidor mientras existan tipos viejos sin backfill.

### Out of Scope
- Rediseño de UI de administración.
- Eliminación total del fallback legacy en el mismo rollout.

## Capabilities

### New Capabilities
- `document-types-classification`: administra y expone la clasificación `PERSON | COMPANY` en el catálogo backend.

### Modified Capabilities
- `client-company-contacts`: los consumidores backend/frontend pasan a depender de `documentType.kind` como fuente principal.

## Approach

Extender el catálogo backend con `kind`, propagarlo en DTOs/servicios/tests, y coordinar con APP para que los consumidores lean primero `documentType.kind` antes de usar la heurística transitoria.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `TechStoreSystemAPI/src/catalogs/document-types/**` | Modified | Entidad, DTOs, service, controller, tests |
| `TechStoreSystemAPI/src/clients/**` | Modified | Consumo indirecto de clasificación en flujos dependientes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tipos existentes sin `kind` | High | fallback transitorio + backfill/migración |
| Contrato APP/API desalineado | Med | counterpart coordinado en APP y tests de contrato |
| Clasificación errónea en catálogo | Med | validaciones y pruebas focalizadas |

## Rollback Plan

Revertir la incorporación de `kind` en el catálogo backend y mantener solo la heurística legacy en consumidores hasta replantear el cambio.

## Dependencies

- Coordinación con `C:\Users\sergi\dev\grupo-sts\TechStoreSystemAPP\openspec\changes\document-type-client-kind\proposal.md`

## Success Criteria

- [ ] Backend expone `DocumentType.kind` en create/update/read.
- [ ] El catálogo puede distinguir explícitamente `PERSON` y `COMPANY`.
- [ ] Los consumidores pueden migrar al contrato nuevo sin depender principalmente de heurísticas.