# Service-order inbox client-context delta

## ADDED Requirements

### Requirement: Conversations Are Not Linked to Orders

Inbox threads and messages MUST NOT persist service-order associations. Sending or receiving a message SHALL NOT accept, infer, or create message-order or thread-order links.

#### Scenario: Receiving a customer message

- **GIVEN** a known client has several service orders
- **WHEN** WhatsApp delivers a message from that client
- **THEN** the message MUST be stored in the client conversation
- **AND** no service-order link row MUST be created

### Requirement: Recent Orders Are Client Context

The inbox MAY display recent orders by querying the resolved conversation client at read time. The response MUST label them as client context and SHALL NOT claim they are linked to the conversation.

#### Scenario: Loading conversation context

- **GIVEN** the resolved client has several recent orders
- **WHEN** an authorized user opens the thread
- **THEN** the API MUST return recent client orders ordered by recency
- **AND** the response MUST NOT expose a persisted link relationship

### Requirement: Inbox Visibility Uses Permission

Every authenticated user with `service-order-inbox.read` MUST be able to read all inbox threads regardless of technician assignment or order relationships.

#### Scenario: Technician with inbox permission opens an unassigned client's thread

- **GIVEN** a technician has `service-order-inbox.read`
- **WHEN** the technician requests the inbox
- **THEN** the thread MUST be visible

### Requirement: Read State Is Per User

Unread counts MUST be calculated independently for each authenticated user. Reading a thread SHALL update only that user's receipt.

#### Scenario: One receptionist reads a message

- **GIVEN** two receptionists have the same thread unread
- **WHEN** the first receptionist opens and marks it read
- **THEN** the first receptionist's unread count MUST become zero
- **AND** the second receptionist's unread count MUST remain unchanged

#### Scenario: New inbound message arrives

- **GIVEN** existing user read receipts point to the previous last message
- **WHEN** a new inbound message is persisted
- **THEN** each authorized user's computed unread count MUST increase on the next refresh
- **AND** the existing `inbox.changed` stream MUST trigger focused frontend refresh

### Requirement: Client Phone Visibility Remains Restricted

The inbox MUST mask the client's phone number for reception and technician viewers. Only supervisor and administrator viewers MAY receive and display the complete number.

#### Scenario: Technician opens a conversation

- **GIVEN** a technician has `service-order-inbox.read`
- **WHEN** the thread header and context are returned
- **THEN** the full client phone MUST NOT be exposed

#### Scenario: Supervisor opens the same conversation

- **GIVEN** a supervisor has `service-order-inbox.read`
- **WHEN** the thread header and context are returned
- **THEN** the complete client phone MAY be exposed
