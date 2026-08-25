# Service order final report

## Requirement: Informe final por equipo resuelto

El sistema MUST generar un informe final individual después de confirmar que un equipo pasó al estado técnico `RESUELTA`.

### Scenario: Finalización exitosa

- **GIVEN** un equipo activo perteneciente a una orden de servicio
- **WHEN** su transición a `RESUELTA` se confirma
- **THEN** el sistema MUST generar un PDF con la orden, el equipo, el diagnóstico vigente, la fecha de disponibilidad y las condiciones de recojo
- **AND** MUST intentar enviar la plantilla `estado_final_servicio` en `es_PE`
- **AND** MUST adjuntar el PDF
- **AND** MUST incluir una única respuesta rápida con payload contextual de consulta

### Scenario: Reintento o procesamiento duplicado

- **GIVEN** que la notificación final del equipo ya fue registrada
- **WHEN** el disparador se procesa nuevamente
- **THEN** el sistema MUST NOT crear ni enviar una segunda notificación equivalente

### Scenario: Falla posterior de mensajería

- **GIVEN** que la transición a `RESUELTA` ya fue confirmada
- **WHEN** falla la generación, publicación o entrega de la notificación
- **THEN** el sistema MUST conservar la transición técnica
- **AND** MUST registrar el fallo para operación

## Requirement: Condiciones provisionales

El informe MUST distinguir los valores provisionales de una política comercial definitiva.

### Scenario: Documento de muestra

- **GIVEN** que aún no existen valores comerciales aprobados
- **WHEN** se genera la muestra para revisión de Meta
- **THEN** el PDF SHOULD mostrar 7 días sin cargo, S/ 2.00 diarios desde el octavo día, aviso a 30 días y evaluación administrativa a 90 días
- **AND** MUST indicar que estos valores están sujetos a confirmación comercial
- **AND** MUST NOT afirmar que la propiedad del equipo se transfiere automáticamente
