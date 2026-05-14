# rediagnosis-agreement-versioning Specification

## Purpose

Definir el contrato backend para versionar acuerdos derivados por rediagnóstico, heredando la última versión vigente y preservando trazabilidad completa.

## Requirements

### Requirement: Derived Draft from Current Confirmed Agreement

The backend MUST create a rediagnosis agreement draft from the latest confirmed active agreement for the service order, and SHALL preserve the inherited commercial snapshot when the new version starts.

#### Scenario: Creating a derived draft from the current agreement
- GIVEN a service order already has one confirmed active agreement
- WHEN coordination starts a new agreement after a rediagnosis
- THEN the backend MUST create a new draft derived from that confirmed agreement
- AND the draft MUST include the inherited lines and notes from that source version

#### Scenario: Deriving from the latest active version when history exists
- GIVEN a service order has many historical agreement versions
- AND only one confirmed version is currently active
- WHEN a new rediagnosis draft is created
- THEN the backend MUST inherit from that active version
- AND it MUST NOT derive from a superseded version

### Requirement: Line Provenance and Controlled Mutation

The backend MUST expose provenance for inherited agreement lines and SHALL block editing or deletion of inherited lines, except for the inherited technician-service line. The backend MAY accept new lines added to the derived draft.

#### Scenario: Rejecting mutation of inherited non-service lines
- GIVEN a derived draft contains inherited product or note-backed lines
- WHEN the client tries to edit or remove one inherited non-service line
- THEN the backend MUST reject that change
- AND the inherited line snapshot MUST remain unchanged

#### Scenario: Allowing the technical service exception and new lines
- GIVEN a derived draft contains the inherited technician-service line
- WHEN the client replaces that line amount or concept and adds new extra lines
- THEN the backend MUST accept the technician-service replacement
- AND it MUST preserve inherited-vs-new provenance for every line

### Requirement: Version Supersedence on Confirmation

The backend MUST keep the previous confirmed agreement active until the derived version is confirmed, and SHALL mark the previous confirmed version as superseded when the new version becomes confirmed.

#### Scenario: Confirming the new version replaces the old one
- GIVEN one previous agreement is confirmed and active
- AND a derived draft is ready to confirm
- WHEN the derived draft is confirmed
- THEN the backend MUST mark the new version as confirmed and active
- AND it MUST mark the previous confirmed version as superseded

#### Scenario: Downstream reads use the current active version
- GIVEN a service order has one superseded agreement and one newer confirmed agreement
- WHEN downstream flows request the current agreement for billing, delivery, or display
- THEN the backend MUST resolve the newer confirmed active version
- AND it MUST NOT treat the superseded version as current
