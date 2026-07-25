# Proposal: Realtime service-order inbox

## Why

Messages received by the WhatsApp webhook are persisted correctly, but an operator who already has the inbox open cannot see them until the screen performs another HTTP load.

## What changes

- Add an authenticated SSE stream that only signals inbox invalidation.
- Publish an invalidation after inbound messages, outbound messages, and delivery-status changes.
- Keep message and thread authorization on the existing read endpoints; the stream does not expose customer or message data.

## Rollback

Remove the stream endpoint and publisher. Existing list and message endpoints remain unchanged.
