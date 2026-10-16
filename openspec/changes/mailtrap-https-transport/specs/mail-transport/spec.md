## ADDED Requirements
### Requirement: Transactional API transport
The system SHALL select MAILTRAP_API explicitly through server configuration, keeping SMTP as the default and never silently falling back between transports.
#### Scenario: Corporate email and attachments
- GIVEN Mailtrap is selected with an API token and an active corporate sender
- WHEN an application email is sent
- THEN the system SHALL POST to the fixed production HTTPS endpoint with sender, reply-to, content, and base64 attachments.
#### Scenario: Secret isolation
- GIVEN Mailtrap transport is active
- WHEN an administrator loads settings
- THEN only provider and token-presence metadata SHALL be returned, never the API token.
#### Scenario: Administrative test
- GIVEN Mailtrap transport is active
- WHEN a test is requested without a recipient
- THEN the system SHALL reject without sending.
- WHEN a test is accepted by the provider
- THEN the test result SHALL distinguish provider acceptance from delivery and store the outcome.
#### Scenario: Inactive profile or invalid token
- GIVEN a profile is inactive or the API token is missing
- WHEN application delivery is requested
- THEN the system SHALL reject without SMTP fallback.
#### Scenario: Provider failure
- GIVEN Mailtrap times out or returns an error
- WHEN sending fails
- THEN the system SHALL return a bounded, safe error without credentials and without automatic retry.
