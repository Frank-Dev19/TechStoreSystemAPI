# document-types-classification Specification

## Purpose

Definir la clasificación explícita `PERSON | COMPANY` en el catálogo backend de tipos de documento.

## Requirements

### Requirement: Document Type Classification Contract

The system MUST persist and expose a `kind` classification for every document type as `PERSON` or `COMPANY`.

#### Scenario: Creating a classified document type
- GIVEN a create request for a document type
- WHEN the request is accepted
- THEN the payload MUST include `kind`
- AND the backend MUST persist that classification with the document type record

#### Scenario: Updating a classified document type
- GIVEN an existing document type
- WHEN an update request changes its classification
- THEN the backend MUST validate and persist the new `kind`
- AND subsequent reads MUST expose the updated value

### Requirement: Backward-Compatible Catalog Reads

The system SHALL expose `documentType.kind` to consumers and MAY tolerate legacy rows without that field only during the transition period.

#### Scenario: Reading a classified document type
- GIVEN a document type row with `kind`
- WHEN the backend returns catalog data
- THEN the response MUST include that classification

#### Scenario: Reading a legacy document type row
- GIVEN a legacy document type row without backfilled classification
- WHEN the backend returns catalog data
- THEN the response MAY include an empty or null classification according to the migration strategy
- AND consumers SHALL be able to apply the documented transitional fallback
