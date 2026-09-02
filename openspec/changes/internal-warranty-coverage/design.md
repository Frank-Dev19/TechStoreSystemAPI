# Design

## Decision

`WarrantiesModule` owns coverage state and exposes transaction-aware application methods. `SalesModule` and `ServiceOrdersModule` depend on it; the warranty domain does not call their application services. Warranty intake is orchestrated inside Service Orders so coverage reservation and order creation share one transaction.

The original technician is snapshotted when service coverage is issued. This avoids historical attribution changing after reassignment. The technician attending a claim is stored separately, allowing an administrator-only documented substitute without changing quality attribution.

## Issue sequence

```text
Sale/Delivery transaction
  -> validate eligible source and warranty duration
  -> lock/check unique source unit
  -> create WarrantyCoverage (ACTIVE, PEN 50.00)
  -> append ISSUED movement
  -> commit with source operation
```

## Claim sequence

```text
Reception/Admin
  -> lock ACTIVE, unexpired coverage
  -> create claim and reserve coverage
  -> resolve technician (original for service, assignment policy for product)
  -> create WARRANTY_SERVICE order linked to claim
  -> commit once

Technician diagnosis
  -> validate assigned technician through existing service-order scope
  -> record WARRANTY_APPLIES or WARRANTY_REJECTED
  -> consume full PEN 50.00 and append movement
  -> do not create a normal quote or a new warranty coverage
```

## Data ownership

- Product and commercial-version records define warranty duration policy.
- `WarrantyCoverage` freezes duration, dates, source unit, customer and original technician.
- `WarrantyClaim` links the coverage, warranty service order, diagnosis, outcome and attending technician.
- `WarrantyMovement` is append-only audit history.

## Reporting

Technician quality reports group consumed service-origin coverage by `originTechnicianId`, never by substitute technician. Product-origin claims are excluded from quality attribution.
