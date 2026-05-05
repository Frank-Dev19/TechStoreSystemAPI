# service-order-economic-workflow Specification

## Purpose

Definir la regla backend de liberación por cobertura económica individual de cada orden cuando varias órdenes comparten un mismo comprobante agrupado.

## Requirements

### Requirement: Delivery Gating by Individual Agreement Coverage

The backend MUST evaluate delivery eligibility per service order, even when many orders were billed in the same grouped sale, and SHALL require full coverage of that order's own agreement before marking it delivered.

#### Scenario: Allowing delivery for one fully covered order
- GIVEN one grouped sale covers many service orders
- AND a specific order agreement is fully reconciled
- WHEN delivery is requested for that order
- THEN the backend MUST allow the delivery transition

#### Scenario: Rejecting delivery for an order still pending
- GIVEN one grouped sale covers many service orders
- WHEN a specific order agreement is not fully reconciled
- THEN the backend MUST reject delivery for that order
- AND the coverage of sibling orders in the same grouped sale MUST NOT bypass that validation
