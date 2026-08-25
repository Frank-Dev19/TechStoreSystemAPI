# Encuesta de calidad por orden

## Requisitos

### Encuesta única

El sistema MUST mantener como máximo una encuesta de calidad por orden.

#### Scenario: entrega completa

- **Given** una orden con todos sus equipos entregados y al menos uno atendido
- **When** se solicita la encuesta
- **Then** el sistema MUST reutilizar la encuesta de esa orden y MUST enviar como máximo una plantilla

### Acceso público seguro

El sistema MUST validar la firma y vigencia del token sin exigir autenticación.

#### Scenario: token vigente

- **Given** una encuesta pendiente y vigente
- **When** el cliente consulta el enlace firmado
- **Then** el sistema MUST mostrar únicamente el código y resumen necesarios de la orden

#### Scenario: token inválido o vencido

- **Given** un token inválido o una encuesta vencida
- **When** se consulta o responde
- **Then** el sistema MUST rechazar la operación sin revelar datos de la orden

### Respuesta de un solo uso

La encuesta MUST aceptar calificaciones enteras entre 1 y 5 y un comentario opcional.

#### Scenario: primer envío

- **Given** una encuesta pendiente y vigente
- **When** el cliente envía una respuesta válida
- **Then** el sistema MUST registrar la respuesta y marcar la encuesta como respondida

#### Scenario: segundo envío

- **Given** una encuesta respondida
- **When** se intenta responder nuevamente
- **Then** el sistema MUST conservar la primera respuesta y rechazar la segunda
