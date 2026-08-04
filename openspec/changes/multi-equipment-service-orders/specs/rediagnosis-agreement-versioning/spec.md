# Rediagnosis agreement versioning delta

## MODIFIED Requirements

### Requirement: Derived Draft From Current Item Version

The backend MUST create a rediagnosis commercial draft from the latest accepted version of the affected equipment item. It SHALL NOT clone or reopen unaffected sibling items.

#### Scenario: Rediagnosing one item in a multi-equipment order

- **GIVEN** an order has two accepted item versions
- **AND** only item two returns from execution to rediagnosis
- **WHEN** a derived commercial draft is created
- **THEN** it MUST derive from item two's latest accepted version
- **AND** item one's accepted version MUST remain unchanged

### Requirement: Version Supersedence Per Item

Confirming a derived commercial version MUST supersede the previous version of the same item while preserving all sibling version states.

#### Scenario: Confirming a rediagnosis revision

- **GIVEN** one item has an accepted base version and a newer derived version
- **WHEN** the newer version is accepted
- **THEN** the previous version for that item MUST become superseded
- **AND** accepted versions of sibling items MUST remain active
