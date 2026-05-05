# grouped-service-agreement-billing Specification

## Purpose

Definir el contrato backend para emitir un solo comprobante desde múltiples acuerdos de servicio del mismo cliente operativo, con contribuyente fiscal separado y snapshot fiscal inmutable.

## Requirements

### Requirement: Grouped Service Agreement Billing Contract

The backend MUST accept a grouped billing request built from many pending service agreements of the same operational client and SHALL create a single sale for that grouped selection.

#### Scenario: Creating one sale from many service agreements
- GIVEN many pending service agreements from the same operational client
- WHEN the grouped billing request is accepted
- THEN the backend MUST create one sale
- AND it MUST link that sale to every selected agreement and related service order

#### Scenario: Rejecting mixed-client grouped billing
- GIVEN a grouped billing request containing agreements from different operational clients
- WHEN the backend validates the request
- THEN it MUST reject the operation

### Requirement: Full Settlement Per Agreement

The backend MUST treat every selected agreement as fully settled, and SHALL reject any grouped billing request that attempts to underpay one selected agreement.

#### Scenario: Settling selected agreements fully
- GIVEN the grouped billing request includes many agreements
- WHEN the total and allocations are validated
- THEN each selected agreement MUST be linked as fully covered
- AND each non-selected agreement MUST remain unchanged

#### Scenario: Rejecting partial settlement inside one agreement
- GIVEN a grouped billing request includes one agreement
- WHEN the linked amount for that agreement is less than its total committed amount
- THEN the backend MUST reject the operation

### Requirement: One Traceable Service Line Per Agreement

The backend MUST create one billable service line per selected agreement and SHALL preserve order-level traceability in the stored sale item snapshot.

#### Scenario: Creating sale lines for grouped agreements
- GIVEN many agreements were selected for grouped billing
- WHEN the sale is persisted
- THEN the backend MUST create one service line per selected agreement
- AND each line snapshot MUST identify the related order through a description equivalent to `Servicio técnico - Orden SO2026...`

#### Scenario: Keeping repeated concepts separated
- GIVEN different agreements share the same service concept or repeated products
- WHEN the grouped bill is created
- THEN the backend MUST preserve distinct lines per agreement
- AND it MUST NOT merge them only because their concept or product repeats

### Requirement: Taxpayer Resolution and Fiscal Snapshot

The backend MUST separate the billing taxpayer from the operational client, MUST allow using an existing or newly created taxpayer at billing time, and SHALL persist an immutable fiscal snapshot on the sale.

#### Scenario: Billing with a taxpayer different from the operational client
- GIVEN the grouped billing request references one operational client through the selected agreements
- WHEN the billing taxpayer is another client record
- THEN the backend MUST allow that issuance
- AND the sale MUST persist the taxpayer reference independently from the operational client context

#### Scenario: Persisting immutable fiscal snapshot
- GIVEN the grouped billing request is accepted
- WHEN the sale is created
- THEN the backend MUST persist the fiscal data used at issuance as an immutable snapshot on the sale
- AND later taxpayer updates MUST NOT rewrite that issued sale snapshot
