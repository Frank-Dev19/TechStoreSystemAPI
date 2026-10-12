# Notificaciones pendientes

Given a final failure, when an authorized operator ignores it, then the notification SHALL transition to IGNORED with no next attempt and preserve its error and attempt history. No message SHALL be sent.

Given a concurrently retried notification, when ignore is requested, then its conditional transition SHALL fail rather than replace another state.

Given an attempt stored at 19:37 UTC, when the operator reviews it in Peru, then the UI SHALL display 14:37 regardless of the browser timezone. The timestamp SHALL come from the delivery attempt, not a later review update.
