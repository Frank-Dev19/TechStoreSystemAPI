# Completar automatizaciones de plantillas WhatsApp

## Objetivo
Completar los recordatorios de cotización y recojo, enviar el comprobante aceptado por SUNAT, limitar cada venta de servicio a una sola orden y hacer reintentables/observables los fallos de entrega.

## Alcance
- Una venta originada en servicio técnico pertenece a una sola orden.
- Recordatorio de cotización por versión/equipo después de 48 horas configurables.
- Recordatorio de recojo automático consolidado por orden y manual por equipo.
- Comprobante por WhatsApp únicamente después de aceptación de SUNAT.
- Tres reintentos automáticos con demoras configurables y reintento manual de fallos finales.
- Despliegue de la encuesta ya implementada.

## Rollback
Deshabilitar el scheduler y reintentos mediante variables de entorno, retirar los endpoints nuevos y revertir la migración de estado de entregas. Los documentos históricos permanecen legibles.
