# Service-order staging data reset specification

## ADDED Requirements

### Requirement: Explicit Destructive Migration Gate

The schema migration that removes legacy service-order data MUST abort unless `ALLOW_SERVICE_ORDER_DATA_RESET=true` is present.

#### Scenario: Flag is absent

- **GIVEN** legacy service-order data or schema exists
- **AND** the explicit reset flag is absent
- **WHEN** the migration runs
- **THEN** it MUST fail before deleting service-order data

### Requirement: Preserve Unrelated Business Data

The reset MUST preserve clients, contacts, users, roles, permissions, catalogs, inventory, independent sales, payments, cash records, and WhatsApp threads and messages.

#### Scenario: Resetting staging orders

- **GIVEN** staging contains test orders and unrelated business records
- **WHEN** the authorized reset migration succeeds
- **THEN** legacy order data, order events, order agreements, diagnoses, order-sale links, order-inbox links, and order temporary-document records MUST be removed
- **AND** unrelated records MUST remain

### Requirement: Backup Is the Data Rollback

The deployment procedure MUST create and verify a database backup before enabling the reset. Migration `down` SHALL NOT be documented as recovery for deleted rows.

#### Scenario: Destructive deployment must be rolled back

- **GIVEN** the reset migration already removed legacy order rows
- **WHEN** operators need the previous data
- **THEN** they MUST restore the verified backup
