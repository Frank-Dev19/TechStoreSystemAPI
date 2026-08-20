# Apply progress: Órdenes de servicio con múltiples equipos

## Estado general

- SDD de API y APP escrito y validado.
- Fundamento agregado y comercial inicial backend en GREEN.
- Contrato público agregado, migración protegida y primer corte del wizard implementados.
- El ciclo técnico y el diagnóstico/rediagnóstico por equipo están en GREEN.
- La revisión comercial consolidada, decisiones manuales, descuentos, cancelación por equipo y entrega parcial con cobertura económica global están en GREEN; garantía e inbox siguen pendientes.

## Alcance del corte desplegable 2026-08-04

- Se habilita el trabajo operativo sin facturación: recepción, asignación, diagnóstico, revisión comercial, decisión manual, ejecución y cancelación por equipo.
- La entrega conserva deliberadamente el control económico: solo procede con cobertura `TOTAL` o `EXONERADO`; este corte no introduce una vía manual para marcar pagos.
- Ventas/economía, garantía por serie, rediseño del inbox y ampliación de permisos quedan diferidos y continúan pendientes en `tasks.md`.
- La limpieza previa al despliegue se limita a mantener un único contrato público agregado y a documentar las compatibilidades internas. La eliminación del método batch interno y la extracción de los componentes monolíticos se difieren para evitar un refactor riesgoso en el corte de publicación.

## Evidencia del primer ciclo TDD

| Corte | RED observado | GREEN implementado | Validación |
| --- | --- | --- | --- |
| DTO agregado | imports de contrato inexistente | cabecera común, `items[]`, prioridad `LOW`, normalización de serie | 4 tests PASS |
| Correlativo diario | servicio de códigos inexistente | secuencia MySQL y formato Lima padre/hijos | 2 tests PASS |
| Persistencia agregada | entidad y servicio inexistentes | una transacción para cabecera e items, rollback por excepción | 2 tests PASS |
| Comercial inicial por equipo | entidades y servicio inexistentes; el helper Angular no se invocaba al enviar | versiones aceptadas por equipo, líneas con snapshot y acuerdo consolidado confirmado en la transacción de alta | 2 tests PASS |
| Atomicidad comercial | el agregado no invocaba persistencia comercial | cualquier fallo comercial se propaga antes de asignación y provoca rollback de toda la transacción | 2 tests PASS |
| Migración protegida | migración inexistente | preflight obligatorio, limpieza acotada y cinco tablas base del agregado | 3 tests PASS |
| Lecturas agregadas | listados y detalle solo cargaban la fila plana | `items[]` ordenado y resumen `itemsCount`/`itemCodes`; filtros y búsqueda consultan items | 3 tests PASS nuevos |
| PDF único | el resumen single imprimía solo las columnas legacy | una cabecera con tarjetas para todos los equipos, códigos hijos, prioridad y falla | 1 test multi-equipo nuevo y regresión completa PASS |
| Prioridad por equipo | la cabecera conservaba una copia del primer equipo y alimentaba filtro/SLA | migración reversible elimina `service_orders.priority`; SLA y prioridad quedan en cada ítem; recepción consulta equipos en modal | 41 pruebas backend y 91 pruebas focalizadas frontend |
| Contrato público agregado | `POST /service-orders` recibía una orden plana y existía una ruta batch separada | el endpoint principal recibe cabecera + `items[]` y delega a una única transacción | 10 pruebas del controlador PASS |
| Ciclo técnico por equipo | la transición técnica solo mutaba la cabecera completa | endpoint por `itemId`, lock pesimista, evento por equipo, gate comercial global y proyección de cabecera con progreso parcial | 6 pruebas nuevas de workflow/proyección y regresión de controlador PASS |
| Reasignación común | reasignar forzaba la cabecera a `ASIGNADA` y podía inflar la carga activa de una orden terminada | la etapa y los estados de equipos se conservan; el técnico vive solo en cabecera y el balance distingue órdenes activas/terminales | 2 pruebas nuevas de reasignación PASS |
| Diagnóstico por equipo | el diagnóstico apuntaba a `service_order_id` y mutaba el estado comercial/técnico de toda la orden | FK obligatoria a `service_order_item_id`, secuencia y supersedencia por equipo, alcance del técnico asignado y proyección en la misma transacción | 7 pruebas de servicio/controlador PASS |
| Rediagnóstico y linaje | la revisión derivada clonaba el acuerdo de orden y no distinguía equipos hermanos | draft derivado de la última versión aceptada del equipo afectado; aceptación reemplaza solo versiones del mismo item | 4 pruebas de versionado PASS |
| Revisión comercial consolidada | no existía contrato para editar un equipo y conservar las versiones vigentes de sus hermanos | una transacción crea la versión del item editado, reemplaza su borrador previo, reutiliza aceptaciones intactas y genera el consolidado exacto | 5 pruebas del servicio y 11 del controlador PASS |
| Decisión comercial manual | no existía un registro auditable de la respuesta ya comunicada por el cliente | decisión append-only por versión exacta, actor, canal y fecha; aceptación parcial preservada y confirmación global solo cuando todos los equipos activos están aceptados | 6 pruebas nuevas de servicio/migración y regresión de controlador PASS |
| Cancelación por equipo | no existía solicitud auditable ni diferencia entre cancelación temprana y tardía | antes de ejecución se aprueba atómicamente; después de iniciada queda pendiente y solo supervisión puede aprobar sin cobro o rechazar restaurando el estado previo | 6 pruebas nuevas de servicio/migración/controlador/proyección PASS |

Comandos ejecutados:

```text
npm run test -- --runTestsByPath src/service-orders/dto/create-service-order-aggregate.dto.spec.ts src/service-orders/services/service-order-code.service.spec.ts src/service-orders/services/service-order-aggregate.service.spec.ts --runInBand
npm run test -- --runTestsByPath src/service-orders/dto/create-service-order-aggregate.dto.spec.ts src/service-orders/services/service-order-aggregate.service.spec.ts src/service-orders/services/service-order-initial-commercial.service.spec.ts --runInBand
npx tsc --noEmit
npm run build
git diff --check
```

Resultado acumulado del último corte focalizado: 4 suites y 14 pruebas aprobadas; typecheck, build y `git diff --check` aprobados.

Segundo corte: 7 suites y 60 pruebas aprobadas; typecheck, build y `git diff --check` aprobados.

Tercer corte: DTO, agregado y comercial inicial con 3 suites y 12 pruebas aprobadas; controlador público con 10 pruebas aprobadas; typecheck y build aprobados.

Cuarto corte: workflow técnico y proyección agregada con 5 suites y 52 pruebas aprobadas; typecheck aprobado. El contrato Angular del endpoint por equipo tiene 6 pruebas aprobadas.

Quinto corte: diagnóstico, rediagnóstico, acuerdos compatibles y migración con 6 suites y 43 pruebas aprobadas; typecheck backend y build frontend aprobados. El modal técnico selecciona obligatoriamente el equipo cuando hay más de uno y tiene 16 pruebas aprobadas.

Sexto corte: revisión comercial consolidada con 4 suites y 34 pruebas focalizadas aprobadas. La regresión backend completa cerró con 44 suites y 275 pruebas aprobadas; typecheck, build, lint focalizado de los archivos nuevos y `git diff --check` aprobados. El compositor Angular y su servicio HTTP aprobaron 18 pruebas focalizadas, typecheck y build de producción.

Séptimo corte: decisiones comerciales manuales append-only con 4 suites y 35 pruebas focalizadas aprobadas. La regresión backend completa cerró con 46 suites y 283 pruebas aprobadas; typecheck y build de producción aprobados. El modal técnico y el servicio Angular aprobaron 20 pruebas focalizadas, typecheck y build de producción. Registrar la decisión no arma ni envía mensajes o plantillas de WhatsApp.

Octavo corte: el registro manual se propagó a recepción y supervisor mediante un modal compartido, conservando la versión exacta, actor, canal y observación. La regresión comercial conjunta de los tres paneles y el servicio HTTP cerró con 79 pruebas aprobadas; typecheck y build Angular de producción aprobados. El texto visible está en español peruano y advierte expresamente que la acción no envía WhatsApp.

Noveno corte: descuentos porcentuales por línea integrados con `pricing_configs`, cálculo base/descuento/neto y snapshot inmutable en `service_order_line_discounts`. Un exceso del máximo se rechaza salvo permiso `override-discount-limit` y motivo obligatorio; recepción y técnico reciben permiso dentro del límite, supervisor recibe además override. Backend focalizado con 30 pruebas y regresión completa con 47 suites/288 pruebas aprobadas. El compositor técnico muestra el libro de importes por línea, conserva mensajes backend y la regresión comercial Angular cerró con 81 pruebas aprobadas; typecheck y builds de producción aprobados. La edición visual en recepción y supervisor queda para el siguiente corte frontend.

Décimo corte: cancelación auditable por equipo con actor, canal, motivo, fecha y restauración del estado previo. La cancelación anterior a ejecución se aprueba en la misma transacción; una solicitud posterior queda en `CANCELACION_SOLICITADA` y requiere el permiso separado `service-order.item-cancel-after-start`. Recepción y técnico registran solicitudes; supervisión resuelve las tardías mediante un modal compartido en español y ninguna acción envía WhatsApp. La regresión backend cerró inicialmente con 50 suites y 304 pruebas aprobadas; typecheck y build aprobaron. En Angular, 94 pruebas focalizadas aprobaron, además del typecheck y build; la suite completa mantiene el único fallo previo de `document-types.spec.ts` (184/185 aprobadas).

Undécimo corte: la aprobación tardía con cobro crea una versión comercial de ajuste y un nuevo consolidado, conserva al equipo en `CANCELACION_SOLICITADA` y espera una decisión manual del cliente. La aceptación finaliza la cancelación; una solicitud de cambios devuelve la solicitud a revisión. Tanto la aprobación sin cobro como la aceptación del cargo se bloquean mientras exista una venta confirmada, sin modificar venta, caja, inventario ni vínculos. El modal supervisor permite registrar el monto y explica que la cancelación no será definitiva hasta la aceptación.

Regresión al cierre del undécimo corte: backend completo con 50 suites y 308 pruebas aprobadas; frontend focalizado de cancelación y cliente HTTP con 11 pruebas aprobadas; typecheck y builds de producción aprobados en ambos repositorios.

Duodécimo corte: entrega transaccional por equipo con lock, evento e idempotencia. El API exige equipo listo, ausencia de cancelación pendiente, acuerdo global vigente `CONFIRMED` y cobertura `TOTAL` o `EXONERADO`; el endpoint legado queda limitado a órdenes de un solo equipo. La cabecera proyecta `ENTREGA_PARCIAL`, excluye cancelados del cierre y envía la encuesta solo al entregar el último equipo activo. Recepción selecciona el equipo en un modal compartido y actualiza esa orden en memoria; recepción, técnico y supervisor muestran progreso `n de m` en español. Backend completo con 52 suites y 324 pruebas aprobadas. Frontend focalizado con 98 pruebas aprobadas, typecheck y build de producción aprobados; la regresión completa quedó en 191/192 por el fallo previo ajeno de `document-types.spec.ts`.

Decimotercer corte: cancelación múltiple inmediata con canal y motivo comunes. Los equipos en `ASIGNADA` no generan cargo; desde `EN_DIAGNOSTICO` generan S/ 20 por equipo, con constancia obligatoria del operador, versiones comerciales aceptadas y un acuerdo confirmado consolidado pendiente de pago. La transacción rechaza el lote completo ante un equipo inválido o una venta confirmada. Ventas admite órdenes canceladas con deuda pendiente sin habilitar órdenes cerradas sin solución. La resolución supervisada permanece únicamente para solicitudes legacy. Backend completo: 53 suites y 333 pruebas aprobadas, typecheck y build aprobados. Frontend: 14 pruebas focalizadas y build de producción aprobados.

Decimocuarto corte: la cancelación deja de implicar devolución física. Los equipos cancelados sin cargo pueden entregarse inmediatamente; aquellos con cargo de diagnóstico requieren pago total o exoneración. La entrega registra `deliveredAt` y un evento auditable sin reemplazar `CANCELADA`. El progreso de entrega incluye equipos cancelados pendientes de devolución y el selector permite desmarcar y volver a marcar el mismo equipo.

Decimoquinto corte: entrega múltiple atómica mediante `PATCH /service-orders/:id/item-deliveries`. El modal adopta selección múltiple con checkbox general vacío, marcado e indeterminado; conserva visibles los equipos bloqueados con su motivo. El endpoint individual delega al lote, los reintentos no duplican eventos y la encuesta espera la devolución física de todos los equipos cuando al menos uno no fue cancelado. Backend completo: 53 suites y 344 pruebas aprobadas, typecheck y build aprobados. Frontend focalizado: 70 pruebas aprobadas, typecheck y build de producción aprobados.

Corrección posterior: toda respuesta de proyección rehidrata `assignedTechnician` y `assignedToTechnicianName` después de guardar. `assignedToTechnicianId` permanece intacto y no se invocan sugerencias ni ajustes de balance. Las 27 pruebas focalizadas de proyección y entrega, el typecheck y el build aprobaron.

Regresión al cierre del quinto corte: backend completo con 43 suites y 269 pruebas aprobadas. Frontend completo ejecutó 162 pruebas: 161 aprobaron y permanece 1 fallo ajeno en `document-types.spec.ts`; el panel técnico focalizado aprobó sus 16 pruebas y el build de producción terminó correctamente.

`npm run migration:show` no pudo validarse porque no hay MySQL local escuchando en `127.0.0.1:3306`. No se ejecutó `migration:run` ni se modificó ninguna base de datos.

Primer intento real en MySQL de staging: las migraciones de fundamento agregado y decisiones comerciales se aplicaron y registraron; la migración de descuentos se detuvo antes de crear su tabla porque `pricing_config_id` era `INT` firmado y `pricing_configs.id` es `INT UNSIGNED`. El hotfix alinea la migración y la entidad como `UNSIGNED`, añade una regresión SQL focalizada y permite reanudar desde la tercera migración sin repetir las dos ya registradas.

El lint completo no se marca como validado: el repositorio conserva deuda previa de formato CRLF/Prettier. El lint focalizado de los nuevos DTO, entidades, migraciones y servicios comerciales sí termina sin errores.

## Límite deliberado del corte

`ServiceOrderAggregateService` ya atiende `POST /service-orders`. La ruta pública batch fue retirada, pero el método y DTO batch internos permanecen temporalmente para su eliminación controlada junto con sus pruebas legacy.

La compatibilidad temporal sigue proyectando el primer equipo en las columnas legacy de `service_orders`. Esa proyección se retirará cuando todos los lectores hayan migrado a `items[]`.
