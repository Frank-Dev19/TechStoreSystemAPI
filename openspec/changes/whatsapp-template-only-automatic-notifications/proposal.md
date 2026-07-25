# Proposal: WhatsApp template-only automatic notifications

## Problem

Las notificaciones automáticas de órdenes pueden degradarse a texto libre cuando la
ventana de atención de WhatsApp está abierta. Esto mezcla dos contratos distintos:
mensajería manual del inbox y notificaciones proactivas basadas en plantillas aprobadas.

## Change

- Toda notificación automática MUST usar una plantilla aprobada de Meta.
- El backend SHALL enviar únicamente el nombre, idioma, variables y componentes de la plantilla.
- La apertura de la ventana de 24 horas MUST NOT cambiar el canal de una notificación automática.
- El texto libre SHALL quedar reservado a mensajes manuales enviados desde el inbox.
- Una notificación automática sin plantilla configurada MUST ser omitida y registrada, sin degradarse a texto libre.
- Los registros internos de notificaciones automáticas SHALL NOT almacenar cuerpos de
  mensaje sintetizados; conservarán únicamente metadata de plantilla y entrega.
- Los servicios genéricos que acepten un cuerpo automático arbitrario MUST ser eliminados.

## Rollback

Revertir este cambio restaura el fallback automático a texto libre. No requiere migración de datos.
