# Rediagnosis and requote template delta

## ADDED Requirements

### Requirement: Derived commercial versions use the requote template

When an issued commercial version derives from an earlier version, the system
MUST send the approved Peruvian Spanish requote template instead of the initial
diagnosis template.

#### Scenario: Additional fault changes the quote

- **GIVEN** an equipment has a derived commercial version and a current rediagnosis
- **WHEN** an operator sends that version to the customer
- **THEN** the system MUST generate a PDF from the current diagnosis and derived version
- **AND** it MUST send `rediagnostico_recotizacion_equipo` in `es_PE`
- **AND** the PDF MUST be attached as the template document header
- **AND** the quick-reply acceptance payload MUST identify the commercial version

### Requirement: WhatsApp acceptance is a customer decision

The system MUST process a signed Meta webhook carrying the version-scoped
acceptance payload as a direct customer decision and MUST NOT attribute it to an
internal operator.

#### Scenario: Customer accepts the requote button

- **GIVEN** Meta sends `ACEPTAR_COTIZACION:<versionId>` through the verified webhook
- **WHEN** the commercial version still accepts decisions
- **THEN** the system MUST record an accepted WhatsApp decision for that version
- **AND** `recorded_by_user_id` MUST remain null
- **AND** a repeated webhook MUST NOT duplicate or reverse the acceptance

#### Scenario: Initial diagnosis quote

- **GIVEN** the commercial version is the first version and has no parent
- **WHEN** it is sent to the customer
- **THEN** the system MUST continue using the initial diagnosis and quote template
