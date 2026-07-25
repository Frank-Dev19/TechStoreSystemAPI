# Service order inbox realtime delta

## ADDED Requirements

### Requirement: Authenticated inbox invalidation stream

The API MUST expose an authenticated server-sent event stream to inbox users with `service-order-inbox.read`.

#### Scenario: WhatsApp webhook persists an inbound message

- **GIVEN** an authorized operator has an inbox stream open
- **WHEN** the webhook persists an inbound WhatsApp message
- **THEN** the API MUST emit an `inbox.changed` invalidation
- **AND** the event MUST NOT contain message text, phone numbers, or customer data

#### Scenario: Connection remains idle

- **GIVEN** an authorized operator has an inbox stream open
- **WHEN** no messages change
- **THEN** the API SHOULD send heartbeat events so intermediaries do not silently close the connection
