# Atomic service-order operation delta

## ADDED Requirements

### Requirement: Atomic diagnosis and workflow operations

Diagnosis creation, technician assignment, and technical transitions MUST lock the target order and persist all local side effects in one transaction.

#### Scenario: A side effect fails

- **GIVEN** an order operation is in progress
- **WHEN** its balance, event, or status write fails
- **THEN** all database changes from that operation MUST roll back

#### Scenario: Notification is dispatched

- **GIVEN** the local operation succeeds
- **WHEN** the transaction commits
- **THEN** external notification MAY be dispatched
- **AND** it MUST NOT be dispatched before commit
