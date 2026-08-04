# Multi-equipment commercial workflow specification

## ADDED Requirements

### Requirement: Per-Item Commercial Versions

The backend MUST version commercial content independently for each equipment item and SHALL keep immutable snapshots of accepted versions.

#### Scenario: Modifying only one equipment item

- **GIVEN** item one has an accepted version and item two requests changes
- **WHEN** a revised consolidated proposal is created
- **THEN** item one MUST retain its accepted version
- **AND** only item two MUST receive a new commercial version

#### Scenario: Repeating change requests

- **GIVEN** an item has already requested one modification
- **WHEN** the client requests another modification to its replacement version
- **THEN** the backend MUST create a further derived version
- **AND** the complete lineage MUST remain queryable

### Requirement: Consolidated Agreement Revisions

Each visible proposal MUST be a consolidated order revision referencing one exact commercial version for every included active item.

#### Scenario: Confirming the order agreement

- **GIVEN** every non-cancelled item version in the current consolidated revision is accepted
- **WHEN** the final decision is recorded
- **THEN** the consolidated agreement MUST become confirmed
- **AND** the order MAY become authorized for execution

#### Scenario: One active item is undecided

- **GIVEN** at least one non-cancelled item is pending or requests changes
- **WHEN** the aggregate commercial state is calculated
- **THEN** the agreement MUST NOT be confirmed

### Requirement: Audited Manual Client Decisions

Reception, the assigned technician, supervision, and administration MUST be able to record a client decision when granted `service-order-agreement.record-client-decision`. Every decision SHALL identify the exact version, recorder, date, channel, and optional observation.

#### Scenario: Reception records an acceptance received by WhatsApp

- **GIVEN** a current item version is awaiting client response
- **WHEN** reception records `ACCEPTED` with channel `WHATSAPP`
- **THEN** an append-only decision record MUST be stored
- **AND** the accepted snapshot MUST become immutable

#### Scenario: Technician attempts another technician's order

- **GIVEN** a user is authorized only as technician
- **AND** the order is assigned to another technician
- **WHEN** the user attempts to record a decision or edit its proposal
- **THEN** the backend MUST reject the action

### Requirement: Discount Snapshot by Commercial Line

Discounts MUST be applied to eligible product or service lines, validated against current pricing limits, and stored as immutable snapshots with their calculated monetary effect.

#### Scenario: Technician applies an allowed discount

- **GIVEN** the assigned technician has `service-order-agreement.apply-discount`
- **AND** a five-percent discount is within the configured maximum
- **WHEN** the technician saves the draft
- **THEN** the backend MUST persist the rule metadata and calculated amount
- **AND** the accepted net price MUST NOT change when pricing configuration changes later

#### Scenario: Discount exceeds the maximum

- **GIVEN** a requested discount exceeds the configured maximum
- **WHEN** a user without `service-order-agreement.override-discount-limit` submits it
- **THEN** the backend MUST reject the discount

### Requirement: Notifications Remain Explicitly Disabled

Commercial and state mutations in this change MUST NOT synthesize or send free-text WhatsApp notifications. New automatic notifications MAY be introduced only through a separate approved Meta-template specification.

#### Scenario: Agreement becomes confirmed

- **GIVEN** all item decisions confirm the agreement
- **WHEN** the backend persists the confirmation
- **THEN** it MUST NOT construct a free-text WhatsApp message
