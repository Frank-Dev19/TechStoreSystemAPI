# Diseño

La transición del equipo se confirma dentro de su transacción actual. Fuera de ella se invoca un servicio de notificación que carga el equipo y su diagnóstico vigente, genera el PDF, crea un documento temporal y entrega una plantilla mediante la matriz de mensajería existente.

```text
Operador -> ItemWorkflow: RESUELTA
ItemWorkflow -> MySQL: commit estado y evento
ItemWorkflow -> FinalReportNotification: notificar equipo
FinalReportNotification -> PDF/TempStorage: generar y publicar
FinalReportNotification -> MessageMatrix: estado_final_servicio
MessageMatrix -> WhatsApp: documento + quick reply
```

La idempotencia usa el identificador del equipo. La notificación es un efecto posterior: sus fallos no revierten el trabajo técnico.
