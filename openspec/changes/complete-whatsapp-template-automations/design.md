# Diseño

```text
Scheduler / SUNAT / operador
          |
          v
Orquestador de notificaciones -> documento temporal privado
          |
          v
NotificationMessage (payload + próxima ejecución)
          |
          v
WhatsApp Cloud API -> SENT | RETRY_SCHEDULED | FAILED_FINAL
```

Las claves idempotentes pertenecen al hecho de negocio: versión comercial, documento electrónico u orden/subconjunto de equipos. Los reintentos reutilizan la misma notificación y crean intentos adicionales.
