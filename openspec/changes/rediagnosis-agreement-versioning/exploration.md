## Exploration: rediagnosis-agreement-versioning

### Current State
El backend ya versiona acuerdos por `sequenceNumber` y estados `DRAFT`/`CONFIRMED`/`SUPERSEDED`, pero hoy el flujo de creación no hereda contenido previo. `create()` supersede solo borradores cuando entra un nuevo borrador, mantiene vivo el acuerdo confirmado anterior hasta la nueva confirmación y persiste el nuevo acuerdo únicamente con el payload recibido. `update()` además permite reescribir por completo un borrador: borra productos y línea de servicio técnico y los reconstruye desde cero. Con esto, el sistema soporta reemplazo de acuerdos, pero NO garantiza carry-forward del acuerdo anterior ni inmutabilidad de las líneas heredadas tras un nuevo diagnóstico.

### Affected Areas
- `src/service-orders/service-agreements/service-agreements.service.ts` — hoy crea/supersede acuerdos, calcula secuencia y permite actualización total del borrador.
- `src/service-orders/service-agreements/dto/create-service-agreement.dto.ts` — contrato actual no expresa intención de “heredar desde acuerdo previo” ni delta incremental.
- `src/service-orders/service-agreements/dto/update-service-agreement.dto.ts` — hoy habilita patch amplio sobre el borrador, incompatible con congelar líneas heredadas.
- `src/service-orders/service-agreements/entities/service-agreement.entity.ts` — probable punto para metadata de origen/versionado si se necesita rastrear acuerdo padre.
- `src/service-orders/service-agreements/service-agreements.service.spec.ts` — faltarán escenarios de herencia, supersedencia por rediagnóstico y excepción editable de servicio técnico.

### Approaches
1. **Snapshot heredado con líneas bloqueadas** — al crear acuerdo desde un nuevo diagnóstico, clonar productos/notas/línea técnica del acuerdo vigente al nuevo borrador, marcarlo como derivado del acuerdo anterior y aceptar en el contrato solo agregados nuevos más override explícito del monto de servicio técnico.
   - Pros: preserva historial real por versión, evita que el frontend tenga que reconstruir manualmente el pasado y permite validar inmutabilidad en backend.
   - Cons: requiere extender contrato/servicio para distinguir líneas heredadas vs nuevas y probablemente agregar metadata de trazabilidad.
   - Effort: Medium

2. **Merge ciego desde frontend** — dejar que la APP envíe acuerdo completo ya mezclado y hacer que backend solo supersede/persista.
   - Pros: menor cambio inicial en API.
   - Cons: rompe la regla central porque la inmutabilidad quedaría confiada al cliente; cualquier consumidor alterno podría editar o borrar lo heredado.
   - Effort: Low

### Recommendation
Adoptar **Snapshot heredado con líneas bloqueadas**. La regla importante NO es solo reemplazar acuerdos, sino garantizar que lo heredado permanezca intacto aunque nazca una nueva versión por rediagnóstico. Esa garantía debe vivir en backend. La excepción de la línea de servicio técnico conviene modelarla como único campo heredado que puede recalcularse/reemplazarse en la nueva versión.

### Risks
- Si no se modela bien la relación acuerdo padre/hijo, después será difícil auditar qué parte fue heredada y qué parte fue agregada en la nueva versión.
- Hay reglas aguas abajo (facturación, cobertura, entrega, revenue ranking) que asumen “acuerdo vigente”; deben seguir apuntando solo a la versión confirmada más reciente.
- Los acuerdos automáticos de diagnóstico (`createDiagnosisFeeAgreement`) no deberían quedar accidentalmente mezclados con este flujo de rediagnóstico comercial.

### Ready for Proposal
Yes — Conviene seguir con propuesta/specs para fijar el contrato de herencia, el criterio de supersedencia y las validaciones backend de inmutabilidad.