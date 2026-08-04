# Proposal: Órdenes de servicio con múltiples equipos

## Why

El wizard de recepción actualmente crea una orden independiente por cada equipo. Esto duplica cliente, técnico, tipo de servicio, documentos, acuerdos y seguimiento económico aunque todos los equipos hayan ingresado juntos. También impide representar de forma limpia decisiones comerciales y entregas parciales dentro de una misma atención.

## What changes

- Reemplazar la creación batch de órdenes independientes por una orden agregada con uno o más equipos hijos.
- Mantener cliente, contacto, técnico y tipo de servicio en la cabecera; el tipo de servicio será inmutable.
- Mover prioridad, datos del equipo, diagnóstico, estados técnicos, cancelación, finalización y entrega al equipo hijo.
- Generar códigos `SO-DD-MM-YYYY-NNNN` en zona horaria de Lima y sufijos `-01`, `-02`, etc. para los equipos.
- Versionar la propuesta comercial de cada equipo y consolidar las versiones vigentes en un acuerdo visible por orden.
- Registrar decisiones del cliente manualmente por equipo, con usuario, fecha, canal y observación.
- Aplicar descuentos por línea desde la configuración de precios y congelar su snapshot comercial.
- Permitir cancelación directa antes de ejecución y resolución supervisada después de iniciada.
- Permitir finalización y entrega parcial, manteniendo el pago y la cobertura económica a nivel de orden.
- Agregar búsqueda de garantía por número de serie con referencia opcional al equipo origen y sin aprobación automática.
- Eliminar vínculos persistentes entre mensajes de WhatsApp y órdenes; mostrar órdenes recientes calculadas por cliente.
- Reemplazar contadores de no leídos por rol por estado de lectura por usuario.
- Generar un único PDF de recepción por orden con todos sus equipos.

## Out of scope

- Registrar qué pieza de inventario fue utilizada en una reparación concreta.
- Reservas de inventario o compras pendientes para una reparación.
- Portal o botones públicos para que el cliente responda directamente la propuesta.
- Nuevas notificaciones automáticas; cualquier notificación futura seguirá usando plantillas aprobadas de Meta.
- Multiempresa o aislamiento multitenant.
- Cambios generales de autorización en ventas, caja o inventario.

## Compatibility and destructive data change

El contrato `POST /service-orders/batch` y la semántica de una orden por equipo serán reemplazados. Como los datos actuales de órdenes son de prueba, la migración eliminará datos del dominio de órdenes de servicio y sus vínculos, pero preservará clientes, usuarios, permisos, catálogos, inventario, ventas independientes y conversaciones de WhatsApp.

La migración MUST abortar si no se habilita explícitamente el reinicio destructivo. El despliegue requiere backup verificado. Los datos eliminados solo podrán recuperarse desde ese backup.

## Rollback

- Revertir aplicación e imagen a la versión previa.
- Ejecutar el `down` de esquema únicamente si todavía no se han creado órdenes bajo el modelo nuevo.
- Si la migración destructiva ya eliminó datos, restaurar el backup de base de datos y el respaldo de archivos; el `down` no recupera información eliminada.

## Success criteria

- Un envío del wizard crea exactamente una orden y uno o más equipos de manera atómica.
- Los tres paneles operan sobre la misma cabecera y los mismos equipos sin duplicar órdenes.
- Una modificación comercial de un equipo no invalida aceptaciones sin cambios de otros equipos.
- Ningún equipo inicia ejecución hasta que todos los equipos activos queden comercialmente aceptados.
- Cada lectura del inbox afecta solo al usuario que abrió la conversación.
- Los mensajes y conversaciones no almacenan vínculos con órdenes.
