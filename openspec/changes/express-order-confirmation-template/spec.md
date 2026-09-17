# Confirmación de orden Express

## Requirement: Express intake template

The system MUST send the configured Express confirmation template when a committed service order has type `STANDARD_SERVICE`. The body parameters MUST be client name, order code, equipment count and formatted authorized total, in that order. The message MUST NOT request a second commercial acceptance.

### Scenario: Express order is created with an accepted amount

- **Given** a committed `STANDARD_SERVICE` order with an accepted initial commercial total
- **When** its post-commit intake notification is prepared
- **Then** the system MUST use `WHATSAPP_TEMPLATE_STANDARD_ORDER_NAME`
- **And** it MUST include the authorized total as the fourth body parameter
- **And** it MAY include a quick reply for customer questions

### Scenario: Non-Express order is created

- **Given** a committed order whose type is not `STANDARD_SERVICE`
- **When** its post-commit intake notification is prepared
- **Then** the system MUST continue using `WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME`
- **And** it MUST preserve the existing three body parameters
