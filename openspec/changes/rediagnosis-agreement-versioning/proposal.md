# Proposal: rediagnosis-agreement-versioning

## Intent
Cuando una orden entra en rediagnóstico, el nuevo acuerdo comercial debe nacer desde la última versión vigente, no desde cero. Necesitamos heredar el acuerdo anterior, preservar trazabilidad por versión y anular la versión previa al confirmar la nueva.

## Scope

### In Scope
- Crear un borrador derivado que clone líneas y notas del acuerdo confirmado vigente.
- Registrar supersedencia/anulación de la versión previa cuando la nueva versión quede confirmada.
- Bloquear edición y eliminación de líneas heredadas, excepto la línea heredada de servicio técnico.
- Permitir agregar líneas nuevas en la versión derivada y coordinar el contrato esperado por la APP.

### Out of Scope
- Cambios al flujo automático de acuerdos de diagnóstico.
- Reescribir facturación o delivery más allá de seguir leyendo la versión vigente correcta.

## Capabilities

### New Capabilities
- `rediagnosis-agreement-versioning`: Versionado backend de acuerdos derivados por rediagnóstico, con herencia, supersedencia e inmutabilidad de líneas heredadas.

### Modified Capabilities
- None

## Approach
Generar la nueva versión como snapshot derivado del acuerdo confirmado actual, persistiendo relación padre/hijo y metadata suficiente para distinguir líneas heredadas vs nuevas. `update` dejará de reconstruir libremente el borrador: sólo podrá agregar líneas nuevas y reemplazar el monto/concepto de servicio técnico heredado. La versión anterior seguirá vigente hasta confirmar la nueva; al confirmar, la anterior pasará a `SUPERSEDED`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/service-orders/service-agreements/service-agreements.service.ts` | Modified | Crear versión derivada y validar inmutabilidad. |
| `src/service-orders/service-agreements/dto/*.ts` | Modified | Expresar contrato derivado/delta para APP. |
| `src/service-orders/service-agreements/entities/service-agreement.entity.ts` | Modified | Trazabilidad de versión/origen si aplica. |
| `src/service-orders/service-agreements/service-agreements.service.spec.ts` | Modified | Casos de herencia, excepción técnica y supersedencia. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Consultas aguas abajo lean una versión equivocada | Medium | Fijar criterio explícito de “vigente” y cubrirlo con tests. |
| Metadata insuficiente para auditoría | Medium | Persistir parent/version data desde el inicio. |

## Rollback Plan
Revertir el contrato derivado y volver al create/update actual de snapshot completo, eliminando la lógica de parentage y bloqueo de heredados.

## Dependencies
- Respuesta APP/API alineada sobre metadata de herencia y permisos por línea.

## Success Criteria
- [ ] Un rediagnóstico crea un borrador heredado desde el acuerdo confirmado vigente.
- [ ] Confirmar la nueva versión supersede/anula la versión confirmada previa.
- [ ] Backend rechaza edición o eliminación de líneas heredadas salvo la línea de servicio técnico.
