# QZ message signing

## Requirements

### Requirement: QZ requests are signed by the API

The application MUST serve the configured public QZ certificate and MUST sign QZ payloads with SHA-512 on the server for authenticated users with service-order access.

#### Scenario: Authenticated workstation requests a signature

- **Given** an authenticated operator and configured QZ signing files
- **When** Angular sends a QZ payload to the signing endpoint
- **Then** the API SHALL return a base64 SHA-512 signature verifiable with the certificate key
- **And** the private key SHALL NOT be returned to the browser

#### Scenario: QZ retrieves the public certificate during its connection handshake

- **Given** a workstation with the configured QZ public certificate
- **When** QZ opens its browser connection before requesting a signed operation
- **Then** the API SHALL return the public certificate without requiring an authenticated request
- **And** the private signing endpoint SHALL remain protected

### Requirement: Missing signing configuration fails closed

#### Scenario: Signing files are unavailable

- **Given** either QZ signing path is missing or unreadable
- **When** the certificate or signing endpoint is called
- **Then** the API SHALL reject the operation with an actionable service-unavailable response
