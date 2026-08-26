# Service-order commercial quote delivery

## Requirement: Drafts remain internal

Saving a quote MUST persist a `DRAFT` commercial version and MUST NOT send a WhatsApp message. A draft PDF MAY be generated for preview and MUST be labelled as a draft.

### Scenario: First quote for one item in a multi-equipment order

- **GIVEN** a multi-equipment order whose active items do not yet all have a commercial version
- **WHEN** the technician saves the first quote for one selected item
- **THEN** the backend MUST create the selected item's `DRAFT` version
- **AND** the revision MUST contain only the equipment items explicitly submitted by the user
- **AND** it MUST NOT depend on or automatically include commercial versions from sibling items

## Requirement: Customer delivery issues an immutable snapshot

Sending a quote MUST require a current diagnosis and a `DRAFT` version belonging to the selected order item. The system MUST mark that version `ISSUED`, generate a final PDF from the diagnosis and commercial-line snapshots, and dispatch the configured Meta template with the PDF.

## Requirement: Delivery is idempotent

Repeated send requests for the same commercial version MUST NOT create another version or duplicate the first notification. A failed provider attempt MUST remain visible for an explicit retry.

## Requirement: Product prices are not discounted

New commercial versions MUST reject non-zero discounts on product lines. Service-line discounts remain subject to the existing permission and limit rules.
