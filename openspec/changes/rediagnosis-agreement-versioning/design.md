# Design: rediagnosis-agreement-versioning

## Technical Approach
El backend mantendrá el flujo `POST create -> PATCH update -> PATCH confirm`, pero `create()` podrá nacer desde el acuerdo confirmado vigente mediante un draft derivado. La nueva versión clonará snapshot comercial y notas, guardará parentesco con la versión base y marcará procedencia por línea. `update()` dejará de reconstruir todo: sólo aceptará nuevas líneas de producto, actualización de notas del acuerdo y reemplazo controlado de la línea heredada `TECHNICAL_SERVICE`. `confirm()` seguirá siendo el punto que supersede la versión previa.

## Architecture Decisions

### Decision: version lineage at agreement and line level
**Choice**: agregar `derivedFromAgreementId` en `ServiceOrderAgreement`; en líneas, agregar `provenance` (`NEW|INHERITED`) y `derivedFrom...ItemId` nullable.
**Alternatives considered**: inferir herencia solo por `sequenceNumber`; guardar flags UI-only.
**Rationale**: `sequenceNumber` ordena, pero NO explica origen ni permite auditar qué línea fue heredada o nueva.

### Decision: explicit derived-create contract
**Choice**: extender `CreateServiceOrderAgreementDto` con `baseAgreementId?: number` para rediagnóstico; backend valida que sea el `CONFIRMED` activo más reciente.
**Alternatives considered**: heurística implícita por estado técnico/diagnóstico.
**Rationale**: evita ambigüedad entre “primer acuerdo” y “nueva versión”, y alinea APP/API sin adivinar intención.

### Decision: computed edit permissions in response
**Choice**: mapear respuesta de acuerdo para incluir metadata por línea (`isInherited`, `canEdit`, `canDelete`).
**Alternatives considered**: que APP deduzca reglas desde `serviceCodeSnapshot`.
**Rationale**: la regla de negocio vive en API; la APP sólo la representa.

## Data Flow

```text
APP open modal
  -> GET agreements
  -> operador envía POST {baseAgreementId, technicalServiceAmount?, notes}
  -> API clona active confirmed -> crea DRAFT derivado
  -> PATCH draft acepta {notes, technicalServiceAmount, newProducts[]}
  -> PATCH confirm(draftId)
  -> API marca parent CONFIRMED => SUPERSEDED y draft => CONFIRMED
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/service-orders/service-agreements/entities/service-agreement.entity.ts` | Modify | Parentage/version metadata del acuerdo. |
| `src/service-orders/service-agreements/entities/service-agreement-product.entity.ts` | Modify | Provenance y referencia al item heredado. |
| `src/service-orders/service-agreements/entities/service-agreement-service-item.entity.ts` | Modify | Provenance y excepción editable para servicio técnico. |
| `src/service-orders/service-agreements/dto/create-service-agreement.dto.ts` | Modify | `baseAgreementId` para draft derivado. |
| `src/service-orders/service-agreements/dto/update-service-agreement.dto.ts` | Modify | Contrato delta: notas, `technicalServiceAmount`, `newProducts`. |
| `src/service-orders/service-agreements/service-agreements.service.ts` | Modify | Clonado, validaciones de inmutabilidad y supersedencia. |
| `src/service-orders/service-agreements/service-agreements.service.spec.ts` | Modify | Casos de derivación, bloqueo y confirmación. |

## Interfaces / Contracts

```ts
type CreateAgreementDto = {
  serviceOrderId: number
  diagnosisId?: number
  notes?: string
  technicalServiceAmount: number
  baseAgreementId?: number
}

type UpdateAgreementDto = {
  notes?: string
  technicalServiceAmount?: number
  newProducts?: ServiceOrderAgreementProductItemDto[]
}
```

Respuesta de línea:

```ts
{ id, provenance: 'INHERITED', derivedFromItemId: 44, canEdit: false, canDelete: false }
{ id, provenance: 'INHERITED', serviceCodeSnapshot: 'TECHNICAL_SERVICE', canEdit: true, canDelete: false }
{ id, provenance: 'NEW', canEdit: true, canDelete: true }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Draft derivado usa último `CONFIRMED` activo | Service spec con parent + history |
| Unit | Rechazo de edición/eliminación heredada no técnica | Service spec sobre `update()` |
| Unit | Confirm supersede sólo la versión previa vigente | Service spec sobre `confirm()` |
| Integration | Contrato serializado con metadata de línea | Controller/service response assertions |

## Migration / Rollout

Requiere evolución de esquema para nuevas columnas. No necesita backfill complejo: acuerdos históricos quedan con `derivedFromAgreementId = null`; líneas existentes se leen como `NEW` por default.

## Open Questions

- [ ] ¿La edición de la línea técnica heredada cambia sólo monto o también `notes`/descripción visible?
- [ ] ¿Queremos exponer `supersededByAgreementId` o alcanza con `derivedFromAgreementId + status`?
