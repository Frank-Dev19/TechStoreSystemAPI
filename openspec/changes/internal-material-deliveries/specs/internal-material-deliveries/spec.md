# Internal material deliveries

## ADDED Requirements

### Requirement: Physical issue owns inventory

The API MUST issue only explicitly selected usable, available serials from an accepted equipment quote and MUST atomically persist delivery and movement.

#### Scenario: Duplicate or concurrent issue

- GIVEN one available serial
- WHEN two deliveries request it
- THEN at most one MUST commit and identical retries MUST NOT duplicate stock effects.

#### Scenario: Approval

- GIVEN a quote awaiting acceptance
- WHEN accepted manually or through client decision
- THEN acceptance MUST NOT select serials or move inventory.

### Requirement: Returns and condition

Only returns for reported factory defects of serialized units are in scope. Unused-leftover returns MUST be rejected. Returns MUST preserve original serial, lot and cost. Fault returns MUST set UNDER_REVIEW. Only admin SHALL resolve to USABLE or UNUSABLE with actor, date and reason. Condition MUST NOT imply availability.

#### Scenario: Faulty replacement

- GIVEN ABC was issued
- WHEN ABC is returned faulty and XYZ replaces it
- THEN ABC MUST be blocked and XYZ MUST retain its separate delivery history.

### Requirement: Reconciliation and billing

Every issued quantity MUST be used or returned before billing. Used products and quantities MUST equal the current accepted quote. Changed scope MUST be regularized through existing quotes, never silently billed lower.

#### Scenario: Confirmation before service starts

- GIVEN an equipment item that has not entered EN_EJECUCION
- WHEN material use reconciliation is attempted
- THEN the API MUST reject it and MUST NOT persist a reconciliation.

#### Scenario: Two RAM approved, one used

- GIVEN two RAM approved and one returned for a reported factory defect
- WHEN reconciliation is attempted for one RAM
- THEN the API MUST reject until the commercial authorization is regularized.

#### Scenario: Service sale

- GIVEN reconciled XYZ installed
- WHEN a service sale is created
- THEN the sale MUST inherit XYZ and its delivery/cost without another inventory movement.

#### Scenario: Cancellation

- GIVEN an issued service sale
- WHEN the sale is cancelled
- THEN inventory MUST NOT receive installed parts automatically.

#### Scenario: No products

- GIVEN an authorized service without product lines or outstanding deliveries
- WHEN billed
- THEN no material guide MUST be required.
