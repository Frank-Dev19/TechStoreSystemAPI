# Confirmación Express

Given a STANDARD_SERVICE order, when its confirmation is generated, then the system SHALL use orden_express_confirmada (or its explicit configured equivalent), es_PE, a PDF header, four variables in order (client, order, equipment count, total), and no buttons.

Given the caller supplies a quick reply, when the Express confirmation is generated, then it MUST omit that quick reply to match the approved template.

Given diagnosis or reception intake, when its template is generated, then its existing variables and buttons SHALL remain unchanged.
