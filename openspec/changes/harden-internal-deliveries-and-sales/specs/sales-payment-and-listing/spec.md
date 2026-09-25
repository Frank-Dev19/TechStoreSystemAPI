# Sales payment and listing

## Requirements

### Requirement: Payment amount follows payment method

The system SHALL charge the fiscal total exactly for card and other non-cash methods. For a single cash payment it SHALL accept the total rounded to the nearest S/ 0.10.

#### Scenario: Cash total with cents

- **WHEN** a sale totals S/ 508.52 and the payment method is cash
- **THEN** the payable cash amount is S/ 508.50 while the fiscal sale total remains S/ 508.52

### Requirement: Sales list uses issue date

The system SHALL apply list date filters to `issueDate`, which is the business date shown on the receipt.

#### Scenario: Newly issued sale

- **WHEN** a sale is created with an issue date inside the selected range
- **THEN** it appears in the sales list for that range
