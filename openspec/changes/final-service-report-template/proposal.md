# Informe final y plantilla de estado final

## Problema

Cuando un equipo termina satisfactoriamente, el cliente necesita una comunicación breve con un documento que identifique el equipo, resuma el resultado y explique las condiciones de recojo.

## Cambio

- Generar un informe final por equipo al marcarlo como resuelto.
- Enviar la plantilla de utilidad `estado_final_servicio` con el PDF y una única respuesta rápida `Tengo una consulta`.
- Mantener la transición técnica aunque falle la notificación posterior.
- Usar condiciones provisionales de recojo configurables hasta que el negocio apruebe sus valores definitivos.

## Rollback

Retirar el disparo posterior a la transición y conservar el generador sin afectar estados ni datos persistidos.
