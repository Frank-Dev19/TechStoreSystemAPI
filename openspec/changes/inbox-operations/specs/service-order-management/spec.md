## ADDED Requirements
### Requirement: Assigned customer conversations
The API SHALL allow technicians to read full customer history only while they have an assigned active or archived order. Technicians SHALL send only while an assigned active order exists. Global staff SHALL read and send on all threads, including unlinked and completed ones. Unknown viewer roles SHALL be rejected.
#### Scenario: Reassignment
- **Given** A's only order is reassigned to B
- **When** A reads, sends or downloads an attachment
- **Then** access SHALL be rejected and B SHALL receive the customer history.
#### Scenario: Shared customer
- **Given** A and B each have an assigned order for the customer
- **When** either reads the chat
- **Then** all conversation messages SHALL be visible without per-message scope.
#### Scenario: Archive
- **Given** a technician has only completed assigned orders for the customer
- **When** they open archived chats
- **Then** the thread SHALL be readable but sending SHALL be rejected.
### Requirement: Bounded inbox queries
Thread searches SHALL run on the server. History SHALL return at most 50 messages by default with an older-message cursor. Events SHALL identify authorized changed threads only. Global staff SHALL be able to associate an existing order with a thread.
