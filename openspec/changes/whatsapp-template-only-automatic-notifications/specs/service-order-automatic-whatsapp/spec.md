# service-order-automatic-whatsapp Specification

## Purpose

Garantizar que las notificaciones automáticas de órdenes utilicen exclusivamente
plantillas aprobadas de WhatsApp.

## Requirements

### Requirement: Automatic notifications use approved templates

The backend MUST dispatch every configured automatic service-order notification as
a WhatsApp template and SHALL pass only the template name, language and variables
required by Meta.

#### Scenario: Customer service window is open
- GIVEN an automatic service-order notification has an approved template
- AND the customer service window is open
- WHEN the notification is dispatched
- THEN the backend MUST dispatch the approved template
- AND it MUST NOT send a generated free-text message

#### Scenario: Customer service window is closed
- GIVEN an automatic service-order notification has an approved template
- AND the customer service window is closed
- WHEN the notification is dispatched
- THEN the backend MUST dispatch the same approved template
- AND it MUST NOT attempt a free-text fallback

### Requirement: Missing automatic template fails closed

The backend MUST NOT convert an automatic notification into free text when its
approved template is not configured.

#### Scenario: Survey template is not configured
- GIVEN a delivered-order survey notification has no configured Meta template
- WHEN the automatic notification is evaluated
- THEN the backend MUST omit the dispatch
- AND it MUST NOT send generated text through the WhatsApp text endpoint

### Requirement: Manual inbox messages remain available

The backend MAY send operator-authored inbox messages as free text while the
customer service window is open.

#### Scenario: Operator replies during the active window
- GIVEN an authorized operator writes a manual inbox reply
- AND the customer service window is open
- WHEN the reply is sent
- THEN the backend MAY use the WhatsApp text endpoint

### Requirement: No generated automatic message body

The backend MUST NOT build or queue an arbitrary text body for ticket, service-order,
diagnosis or commercial-agreement state changes.

#### Scenario: State change triggers an automatic notification
- GIVEN a service-order or commercial-agreement state change requires notification
- WHEN the backend prepares the Meta request
- THEN it MUST select an approved template
- AND it MUST pass structured template variables
- AND it MUST NOT construct or persist a generated message body
