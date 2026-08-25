# Reliable service-order WhatsApp automation delta

## Requirements

### Requirement: Aggregate intake dispatch

The system MUST request one intake-summary notification after an aggregate service order commits and MUST NOT request it when the transaction fails.

#### Scenario: Aggregate order commits

- **GIVEN** reception creates an order containing one or more equipment items
- **WHEN** the database transaction commits
- **THEN** the system MUST request one idempotent intake notification for the committed order
- **AND** provider failure MUST NOT roll back the order

#### Scenario: Aggregate order rolls back

- **GIVEN** aggregate order persistence fails
- **WHEN** the transaction rolls back
- **THEN** the system MUST NOT request an intake notification

### Requirement: Single intake template contract

The intake notification MUST use the configured Peruvian Spanish intake template for every service type and MUST pass client name, general order code and equipment count in that order.

#### Scenario: Multi-equipment order

- **GIVEN** an order contains two equipment items
- **WHEN** its intake notification is prepared
- **THEN** body variable 1 MUST contain the client name
- **AND** body variable 2 MUST contain the general order code
- **AND** body variable 3 MUST contain `2 equipos`
- **AND** the reception-summary PDF MUST be attached

### Requirement: Active template contracts remain explicit

Every active service-order template builder MUST have a test that fixes its configured name, language, ordered body variables, document attachment and button parameters.

#### Scenario: Template contract changes

- **GIVEN** a developer changes an active template payload
- **WHEN** focused contract tests run
- **THEN** any incompatible name, language, variable, document or button change MUST fail before deployment
