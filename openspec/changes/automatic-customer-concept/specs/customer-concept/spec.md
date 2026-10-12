# Concepto automático

The system SHALL derive the customer concept from persisted commercial or sale lines, using immutable names and quantities. Product quantities SHALL be combined only for identical products and names. Zero-priced labor SHALL remain visible. Internal lines SHALL remain unchanged.

Given technical service, two RAM and two SSD 2TB, when a quotation is created, then its concept MUST be `Servicio técnico + 2 RAM + 2 SSD 2TB` and its amount MUST remain the stored total.

Given a boleta linked to a service order, when its electronic payload is generated, then it MUST contain one detail with quantity one, the automatic concept and the final sale total, maintaining the stored taxable amount and tax.

Given an ordinary sale or factura, when its payload is generated, then its details SHALL remain itemized.

Given a new quotation or revision with no manual summary, when it is saved or issued, then it SHALL succeed if its other business validations pass.
