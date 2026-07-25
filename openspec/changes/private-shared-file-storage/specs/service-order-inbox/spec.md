# Private inbox storage delta

## ADDED Requirements

### Requirement: Attachments use private configurable storage

Inbox attachment files MUST be stored under the configured private root and MUST remain downloadable only through authenticated API routes.

#### Scenario: Shared volume is configured

- **GIVEN** `PRIVATE_STORAGE_ROOT` points to a mounted shared volume
- **WHEN** an API replica stores an inbox attachment
- **THEN** the file MUST be written beneath that root
- **AND** another replica using the same root MUST be able to serve it
