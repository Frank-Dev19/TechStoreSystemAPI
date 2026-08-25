# Equipment-aware electronic receipt lines delta

## ADDED Requirements

### Requirement: Confirmed equipment versions define receipt lines

When a confirmed service-order quote contains item-version links, the sale MUST
create one line for every billable commercial line of each linked equipment.

#### Scenario: Several equipment are billed in one receipt

- **GIVEN** a confirmed quote contains commercial versions for several equipment
- **WHEN** a sale is created from that quote
- **THEN** each service concept MUST include the equipment item code and a short equipment description
- **AND** each product concept MUST include the equipment item code
- **AND** the electronic billing payload MUST retain those sale descriptions

#### Scenario: A legacy quote has no item-version links

- **GIVEN** a confirmed legacy quote only contains aggregate product and service snapshots
- **WHEN** a sale is created from that quote
- **THEN** the sale MUST continue using the aggregate snapshots

### Requirement: Electronic billing remains provider-generated

The system MUST use the electronic billing provider's PDF and MUST NOT create a
separate local receipt PDF for service orders.
