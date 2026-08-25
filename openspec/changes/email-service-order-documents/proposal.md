# Change: Email service-order documents

## Why

Receptionists can download the intake summary and the linked electronic receipt, but they cannot send either document from the service-order workflow. This forces them to download files and compose messages manually.

## What changes

- Add an authenticated endpoint that emails the service-order intake summary PDF to the order's registered customer email.
- Add a dedicated `service-order.email` permission and grant it to Receptionist.
- Reuse the existing electronic-billing email endpoint for accepted linked receipts.
- Expose both actions from the reception panel at all times and accept a validated one-time recipient when the order has no registered email.

## Impact

- No schema migration is required.
- The existing electronic-billing SMTP configuration is reused.
