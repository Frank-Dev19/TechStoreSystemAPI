# service-order-document-email Specification

## Requirements

### Requirement: Email intake summary

The API SHALL allow an authorized user to email the current intake summary PDF to the email registered on the service order.

#### Scenario: Order has a registered email
- GIVEN an accessible service order has a registered customer email
- WHEN an authorized user requests summary delivery
- THEN the API generates the current summary PDF
- AND sends it to that registered email as an attachment

#### Scenario: Order has no registered email or supplies no recipient
- GIVEN an accessible service order has no registered customer email
- WHEN an authorized user requests summary delivery
- THEN the API rejects the request without sending an email

#### Scenario: One-time recipient is supplied
- GIVEN an accessible service order has no registered customer email
- WHEN an authorized user supplies a valid recipient in the request
- THEN the API sends the summary to that recipient
- AND does not require the customer record to be modified

### Requirement: Separate permission

Sending the intake summary SHALL require `service-order.email` in addition to authentication.

#### Scenario: Receptionist catalog synchronization
- WHEN RBAC bootstrap synchronization runs
- THEN Receptionist receives `service-order.email`
