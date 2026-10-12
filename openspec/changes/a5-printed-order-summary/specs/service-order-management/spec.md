## ADDED Requirements
### Requirement: A5 printed order summary
The system SHALL generate the downloaded order summary on landscape A5 pages (210 × 148 mm, full A4 width and half its height) and preserve all equipment details and customer quotation summaries. The physical copy SHALL omit service terms and use black text and monochrome separators. Digital notification and email documents SHALL retain their current format and service terms.

#### Scenario: Download for printing
- **Given** an accessible service order
- **When** its summary PDF is downloaded
- **Then** every page SHALL have A5 dimensions and long content SHALL continue without truncation.

#### Scenario: Digital document
- **Given** an order summary sent by email or WhatsApp
- **When** its PDF is generated
- **Then** the existing digital layout SHALL remain unchanged.

#### Scenario: Multiple equipment in the physical copy
- **Given** an order with three equipment items and normal-length problem, service and accessory details
- **When** its printed summary is generated
- **Then** the three items SHALL fit on one landscape A5 page with all details preserved.
- **And** equipment blocks SHALL move to a following page when their measured content does not fit; oversized text SHALL continue without truncation.
