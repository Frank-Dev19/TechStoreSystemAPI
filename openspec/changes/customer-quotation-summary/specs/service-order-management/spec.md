## ADDED Requirements

### Requirement: Customer summary per commercial version
The system MUST persist a normalized customerSummary of at most 500 characters separately from diagnosis, notes and internal commercial lines.

#### Scenario: Incomplete draft
- GIVEN a quotation draft with no customer summary
- WHEN it is saved
- THEN saving MUST succeed
- AND issuing it MUST fail until the summary is completed.

#### Scenario: Express acceptance
- GIVEN an Express intake with initial commercial content
- WHEN the order is created
- THEN each equipment quotation MUST have a nonempty customer summary.

#### Scenario: Derived quotation
- GIVEN a previous quotation with a customer summary
- WHEN a revised draft is created without replacing the summary
- THEN the summary MUST be inherited
- AND changing the new summary MUST NOT change the previous version.

### Requirement: One customer-facing concept
Customer quotation PDFs MUST show exactly one commercial concept per equipment quotation and its computed final total, without exposing internal line prices or product listings. Long summaries SHALL wrap without clipping.

#### Scenario: Multiple internal lines
- GIVEN a quotation with services, products and discounts
- WHEN preview, issuance or reminder PDF is generated
- THEN it MUST display the persisted customer summary and unchanged final total
- AND internal lines MUST remain available to operators.

#### Scenario: Historical quotation
- GIVEN an existing issued version without a summary
- WHEN its document is accessed or resent
- THEN a generic service description with equipment context MUST be used without exposing internal lines.

#### Scenario: Express document
- GIVEN an Express order without diagnosis
- WHEN its intake PDF is generated for the customer
- THEN each equipment MUST show its summary and accepted total.
