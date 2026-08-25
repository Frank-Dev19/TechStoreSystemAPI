# Design

```text
Reception -> AggregateService: create order and items
AggregateService -> Database: transaction
Database --> AggregateService: commit
AggregateService -> IntakeNotificationService: notify committed order
IntakeNotificationService -> PDF/temporary storage: create summary document
IntakeNotificationService -> MessageMatrix: idempotent template dispatch
MessageMatrix -> NotificationMessage: QUEUED / retry / final status
MessageMatrix -> Meta: approved template + PDF
```

The aggregate transaction remains the source of truth. WhatsApp preparation starts only after commit and cannot roll back the order. The notification identity is the committed order id, so retries and duplicate HTTP submissions cannot create duplicate customer messages.

Template builders remain the canonical mapping between business values and Meta component order. Focused tests pin name, language, body variables, document header, quick replies and dynamic URL parameters.
