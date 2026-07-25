# Atomic sale lifecycle delta

## ADDED Requirements

### Requirement: Sale creation is atomic

Sale, payment, cash, inventory, and service-order link writes MUST use one database transaction.

#### Scenario: Inventory movement fails

- **GIVEN** a sale is being confirmed
- **WHEN** an inventory movement fails
- **THEN** the sale transaction MUST roll back all sale, payment, cash, inventory, and link writes

### Requirement: Cancellation reverses effects

Cancellation of a confirmed sale MUST reverse inventory and cash effects and deactivate service-order links in one transaction.

#### Scenario: Cancellation is repeated

- **GIVEN** a sale was already cancelled successfully
- **WHEN** cancellation is requested again
- **THEN** the API MUST return the cancelled sale
- **AND** it MUST NOT create a second stock or cash reversal
