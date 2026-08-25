# Proposal: Rediagnosis and requote WhatsApp template

## Why

A derived commercial version currently reuses the initial diagnosis template
and does not attach the updated diagnosis and quote PDF. The customer cannot
distinguish an initial quote from a requote caused by an additional finding.

## What changes

- Detect derived or later commercial versions during issuance.
- Send `rediagnostico_recotizacion_equipo` in `es_PE` for those versions.
- Reuse the current diagnosis and quote PDF renderer with the latest diagnosis
  and derived commercial version.
- Attach the document and send version-scoped quick-reply payloads.
- Apply the customer's signed WhatsApp acceptance without attributing it to an operator.
- Preserve the initial diagnosis template for first versions.

## Data change

`service_order_client_decisions.recorded_by_user_id` becomes nullable because a
decision received directly from the customer has no internal operator.

## Rollback

Route every issued version through the initial diagnosis template again. No
schema rollback is required.
