# Service-order action permission delta

## ADDED Requirements

### Requirement: Actions use dedicated permissions

Editing, technician assignment, technical transition, delivery, and billing-link management MUST be authorized independently.

#### Scenario: Technician transitions an assigned order

- **GIVEN** a technician has `service-order.transition`
- **WHEN** the technician requests an allowed transition for their assigned order
- **THEN** the request MAY proceed
- **AND** that permission MUST NOT authorize assignment, delivery, or billing-link management

#### Scenario: Existing sales authorization

- **GIVEN** this permission change is deployed
- **WHEN** sales, cash, or inventory routes are evaluated
- **THEN** their authorization configuration MUST remain unchanged
