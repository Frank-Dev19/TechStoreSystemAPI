# Internal warranty coverage

## Motivation

Product sales and delivered technical services need one-use internal warranty coverage without creating a SUNAT credit note. The same backend policy must serve Sales and Service Orders while preserving their existing transactions and technician scopes.

## Change

- Add an independent `warranties` domain with coverages, claims and an append-only movement ledger.
- Issue one PEN 50.00 coverage per eligible sold product unit and per delivered service-order item.
- Start product coverage on the sale issue date and service coverage on equipment delivery.
- Route service-origin claims to the original responsible technician and product-origin claims through normal technician assignment.
- Consume the complete coverage for either accepted or rejected technician warranty outcomes.
- Revoke unused coverage when its source sale is cancelled and block cancellation after reservation or consumption.
- Add warranty-specific RBAC grants for administrators and receptionists, with reports restricted to administrators.

## Rollback

Remove the module integrations and revert the additive migration. Existing Sales, Inventory and Service Orders tables retain their original columns except for additive warranty metadata.
