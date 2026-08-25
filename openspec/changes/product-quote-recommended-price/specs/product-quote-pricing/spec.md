# Product quote pricing

## Requirements

### Requirement: Recommended price survives stock depletion

The pricing engine MUST use the current weighted cost when positive and SHALL fall back to the latest positive inventory movement cost when current stock has no cost.

#### Scenario: Product without current stock has history

- **Given** a product with zero current stock and a positive historical movement cost
- **When** its quote price is requested
- **Then** the response MUST contain a positive recommended price and a minimum allowed price equal to 90% of it

#### Scenario: Product has no usable cost

- **Given** a product without current or historical positive cost
- **When** its quote price is requested
- **Then** the request MUST be rejected instead of returning zero

### Requirement: Commercial revisions enforce the minimum

The backend MUST reject a product line whose final unit price is lower than 90% of the current recommended price and MUST snapshot the internal pricing basis used for an accepted line.

#### Scenario: Operator enters a lower price

- **Given** a product with recommended price S/ 100.00
- **When** an operator submits S/ 89.99
- **Then** the whole revision MUST be rejected

### Requirement: Quote editor exposes only useful prices

The quote editor MUST display the recommended and minimum prices, SHALL allow editing the final unit price, and MUST NOT display the internal cost source.

#### Scenario: Operator edits a product

- **Given** a selected product with recommended price S/ 100.00
- **When** the operator enters S/ 95.00
- **Then** the line MUST remain valid and show its updated amount
