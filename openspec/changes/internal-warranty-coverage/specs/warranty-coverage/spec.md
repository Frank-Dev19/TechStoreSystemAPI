# Warranty coverage specification

## Requirement: Fixed one-use coverage

The backend MUST issue one PEN 50.00 coverage for every eligible sold product unit and delivered technical-service item. Coverage MUST preserve the warranty terms active when it is issued.

### Scenario: Product quantity creates individual coverage

- **GIVEN** a confirmed sale contains two units of a warranty-enabled product
- **WHEN** the sale transaction completes
- **THEN** two independent active coverages MUST exist
- **AND** a retry MUST NOT create duplicates

### Scenario: Multi-equipment delivery

- **GIVEN** a paid service order contains two equipment items
- **WHEN** both items are delivered
- **THEN** each item MUST receive its own coverage starting at its delivery timestamp

## Requirement: Claim consumption

A warranty claim MUST reserve its coverage. A technician diagnosis with either `WARRANTY_APPLIES` or `WARRANTY_REJECTED` MUST consume the complete PEN 50.00 exactly once.

### Scenario: Rejected warranty is consumed

- **GIVEN** an active reserved claim
- **WHEN** the technician records `WARRANTY_REJECTED`
- **THEN** the coverage MUST become consumed
- **AND** no normal commercial quotation MUST be generated

## Requirement: Technician continuity

Service-origin claims MUST be assigned to the technician snapshotted from the original completed service. Product-origin claims MAY use the normal assignment suggestion.

### Scenario: Service warranty uses original technician

- **GIVEN** a service coverage attributed to technician 12
- **WHEN** reception creates its warranty intake
- **THEN** the warranty order MUST be assigned to technician 12

### Scenario: Administrative substitute

- **GIVEN** the original technician cannot attend
- **WHEN** an administrator supplies another technician and a non-empty reason
- **THEN** the assigned technician MAY change
- **AND** quality attribution MUST remain on the original technician

## Requirement: Cancellation consistency

Cancelling a source sale MUST revoke active coverage in the same transaction. A sale with reserved or consumed coverage MUST NOT be cancelled through the normal cancellation flow.

## Requirement: No recursive coverage

A `WARRANTY_SERVICE` order MUST NOT issue service coverage when delivered.
