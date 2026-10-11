-- Despegar Grupo 8 — rutina de seed demo (idempotente).
-- La define schema.sql (instalacion nueva) y las migraciones 05/06 (base existente).
-- Passwords de las cuentas demo en datos.md.
--
-- Procedimiento sembrar_demo(): crea las cuentas, reservas, incidentes y respuestas
-- de demostracion. Es idempotente (se puede volver a correr sin duplicar).

CREATE OR REPLACE PROCEDURE sembrar_demo() LANGUAGE plpgsql AS $proc$
DECLARE
  v_admin INT; v_admin2 INT; v_agente INT; v_maria INT; v_carlos INT; v_lucia INT;
  v_ana INT; v_bruno INT; v_sofia INT; v_diego INT; v_valeria INT; v_tomas INT;
  v_r_ana INT; v_r_bruno INT; v_r_sofia INT; v_r_diego INT; v_r_valeria INT; v_r_tomas INT;
  v_inc INT;
BEGIN
  -- Administradores (crean agentes y cambian roles).
  v_admin := upsert_usuario('Laura Admin', 'admin@despegar.com',
    '$2y$10$2nu8Aip8GNKsBukZVvkz9OPSiEyBFKJxVsOWz1yEUg9vi9jLeNPGG', 'admin');
  v_admin2 := upsert_usuario('Diego Admin', 'admin2@despegar.com',
    '$2y$10$qMaDr5Nb.2rg205nTCf8VePlyBJQvzqyEYPoGfq86A5vUXOlG8j4i', 'admin');

  -- Agentes de soporte.
  v_agente := upsert_usuario('Agente Soporte', 'agente@despegar.com',
    '$2y$10$h8KjzhlwFrfgX5zUPcnjmeEMBG.257DLMoNlVCZsb6aB4/AD.UZGy', 'agente');
  v_maria := upsert_usuario('Maria Agente', 'maria@despegar.com',
    '$2y$10$KSHDLrANiJH05AKgaCidQu1paiN8vKxKF47EtbpbvMPMIOY2VTnP2', 'agente');
  v_carlos := upsert_usuario('Carlos Agente', 'carlos@despegar.com',
    '$2y$10$0NdKCEGHWK6VwwFQrD7ZHuHyNxeSN4bcrJ0ZX4XX7KDeq6lrP7ZQ6', 'agente');
  v_lucia := upsert_usuario('Lucia Agente', 'lucia@despegar.com',
    '$2y$10$BsUzCfBu3R7lvxxZlJGhHuYdhhRO3oa5Srr7EaitxJj1lTsPUtAJ2', 'agente');

  -- Viajeros.
  v_ana := upsert_usuario('Ana Viajera', 'ana@test.com',
    '$2y$10$ZvZ0TUfqmACKEKLXiUfhEe7BfqSCPHDRAo4Bx8u7jAwmVQTb1dvyO', 'viajero');
  v_bruno := upsert_usuario('Bruno Viajero', 'bruno@test.com',
    '$2y$10$ldkTQQZJph69wWBpk3RSp.DEewUuized4o1nx4T.x29Za2nBsc8pi', 'viajero');
  v_sofia := upsert_usuario('Sofia Viajera', 'sofia@test.com',
    '$2y$10$ffI7WOToQVBmm0d58WmvRODZnWehrACK2OleAL6avDUER.kAHPhR2', 'viajero');
  v_diego := upsert_usuario('Diego Viajero', 'diego@test.com',
    '$2y$10$qVICSUcbo/xoxEXW0XxOSe6onm64bAZd78cfPAHuthejE4leH.nNK', 'viajero');
  v_valeria := upsert_usuario('Valeria Viajera', 'valeria@test.com',
    '$2y$10$Mlkh9c3ug749L0y55oeb..5jVhFYVMPLYLYU.bSTOevqVMBZ2XGie', 'viajero');
  v_tomas := upsert_usuario('Tomas Viajero', 'tomas@test.com',
    '$2y$10$rbBjdPXvaLM/LAMdYxdWOe7L0ShTrTRQ2YUPmFsHBbhxBee.wBvHO', 'viajero');

  -- Reservas.
  v_r_ana := upsert_reserva(v_ana, 'vuelo', 'AR1234', 'Buenos Aires', 'Cancun', NULL, '2026-11-10', '2026-11-24', 'Confirmada');
  PERFORM upsert_reserva(v_ana, 'hotel', 'HTL889', NULL, NULL, 'Hotel Caribe Maya', '2026-11-10', '2026-11-17', 'Confirmada');
  v_r_bruno := upsert_reserva(v_bruno, 'vuelo', 'LA445', 'Cordoba', 'Miami', NULL, '2026-12-01', '2026-12-15', 'Confirmada');
  PERFORM upsert_reserva(v_bruno, 'hotel', 'HTL221', NULL, NULL, 'Hotel Brickell', '2026-12-01', '2026-12-08', 'Confirmada');
  v_r_sofia := upsert_reserva(v_sofia, 'vuelo', 'AR7788', 'Rosario', 'Barcelona', NULL, '2026-10-25', '2026-11-05', 'Confirmada');
  PERFORM upsert_reserva(v_sofia, 'hotel', 'HTL330', NULL, NULL, 'Hotel Gaudi', '2026-10-25', '2026-10-30', 'Confirmada');
  v_r_diego := upsert_reserva(v_diego, 'vuelo', 'AR5566', 'Mendoza', 'Santiago', NULL, '2026-11-01', '2026-11-12', 'Confirmada');
  v_r_valeria := upsert_reserva(v_valeria, 'vuelo', 'AR9911', 'Montevideo', 'Lima', NULL, '2026-12-20', '2026-12-28', 'Confirmada');
  PERFORM upsert_reserva(v_valeria, 'hotel', 'HTL771', NULL, NULL, 'Hotel Miraflores', '2026-12-20', '2026-12-27', 'Confirmada');
  v_r_tomas := upsert_reserva(v_tomas, 'vuelo', 'AR3322', 'Salta', 'Buenos Aires', NULL, '2026-11-18', '2026-11-20', 'Confirmada');

  -- Incidentes: mezcla de estados, prioridades, SLA (algunos ya vencidos) y asignaciones.
  v_inc := upsert_incidente(v_ana, v_r_ana, 'Vuelo_cancelado',
    'Vuelo cancelado y varada en aeropuerto',
    'La aerolinea cancelo el vuelo AR1234 y no ofrece reprogramacion. Necesito ayuda urgente.',
    'Critica', 'EnGestion', INTERVAL '-6 hours', v_agente, 'Alta', 'Sugerida por tipo Vuelo_cancelado');
  PERFORM upsert_respuesta(v_inc, v_agente, 'Estamos contactando a la aerolinea para reprogramar tu vuelo. Te confirmamos en breve.');

  v_inc := upsert_incidente(v_ana, NULL, 'Equipaje',
    'Equipaje perdido en el vuelo de retour',
    'Mi maleta no aparecio en la cinta transportadora. Ya hice el reclamo en el aeropuerto y me dieron un numero de seguimiento.',
    'Alta', 'Abierto', INTERVAL '20 hours', NULL, 'Alta', 'Sugerida por tipo Equipaje');
  PERFORM upsert_respuesta(v_inc, v_ana, 'Adjunto el numero de seguimiento por si les sirve.');

  v_inc := upsert_incidente(v_bruno, v_r_bruno, 'Hotel_sin_reserva',
    'El hotel no encuentra mi reserva',
    'Llego al hotel de Cordoba y la recepcion no encuentra ninguna reserva a mi nombre. Pague por adelantado.',
    'Critica', 'EnGestion', INTERVAL '-2 hours', v_maria, 'Alta', 'Sugerida por tipo Hotel_sin_reserva');
  PERFORM upsert_respuesta(v_inc, v_maria, 'Estamos verificando con el hotel. Te enviamos una confirmacion escrita.');

  v_inc := upsert_incidente(v_bruno, NULL, 'Cobro_indebido',
    'Me cobraron dos veces por el hotel',
    'Aparecen dos cargos de la misma reserva en el estado de cuenta. Solicito la devolucion del duplicado.',
    'Alta', 'Abierto', INTERVAL '30 hours', NULL, 'Alta', 'Sugerida por tipo Cobro_indebido');

  v_inc := upsert_incidente(v_sofia, v_r_sofia, 'Vuelo_retrasado',
    'Retraso de seis horas en el vuelo a Barcelona',
    'El vuelo salio con seis horas de atraso y perdi la conexion del hotel. Necesito que me reubiquen.',
    'Baja', 'Abierto', INTERVAL '60 hours', NULL, 'Baja', 'Sugerida por tipo Vuelo_retrasado');

  v_inc := upsert_incidente(v_sofia, NULL, 'Fraude',
    'Cobro fraudulento con tarjeta ajena',
    'Me aparecen tres cargos de una tarjeta que no es mia y no reconozco ningun viaje. Solicito bloqueo urgente.',
    'Critica', 'EnGestion', INTERVAL '-30 hours', v_carlos, 'Critica', 'Sugerida por tipo Fraude');
  PERFORM upsert_respuesta(v_inc, v_carlos, 'Bloqueamos los cargos y abrimos la reclamacion con el banco. No compartas mas datos de la tarjeta.');

  v_inc := upsert_incidente(v_diego, v_r_diego, 'Otro',
    'Cupon de descuento no aplicado',
    'Compre con un cupon de la promocion de invierno y el descuento no aparece en el total.',
    'Baja', 'Resuelto', INTERVAL '-40 hours', v_lucia, 'Baja', 'Sugerida por tipo Otro');
  PERFORM upsert_respuesta(v_inc, v_lucia, 'Aplicamos el cupon manualmente y te enviamos la diferencia a la tarjeta original.');

  v_inc := upsert_incidente(v_diego, NULL, 'Vuelo_retrasado',
    'Perdi el vuelo por un cambio de horario',
    'El horario cambio la noche anterior y no recibi aviso. Perdi el vuelo a Santiago y compre otro ticket.',
    'Alta', 'EnGestion', INTERVAL '12 hours', v_agente, 'Baja', 'Sugerida por tipo Vuelo_retrasado');
  PERFORM upsert_respuesta(v_inc, v_agente, 'Reclamamos a la aerolinea por el cambio sin aviso. Te seguimos con el reembolso.');

  v_inc := upsert_incidente(v_valeria, NULL, 'Fraude',
    'Sitio web falso me pidio los datos de la tarjeta',
    'Entre a un sitio que se hace pasar por la empresa y me pidieron el numero de tarjeta. Ya lo denuncie.',
    'Critica', 'Abierto', INTERVAL '-1 hours', NULL, 'Critica', 'Sugerida por tipo Fraude');

  v_inc := upsert_incidente(v_valeria, v_r_valeria, 'Hotel_sin_reserva',
    'Reserva de hotel sin reserva en el sistema',
    'La reserva aparece en mi app pero el hotel dice que no tiene nada a mi nombre para esas fechas.',
    'Alta', 'Abierto', INTERVAL '26 hours', NULL, 'Alta', 'Sugerida por tipo Hotel_sin_reserva');

  v_inc := upsert_incidente(v_tomas, v_r_tomas, 'Equipaje',
    'Maleta danificada en el check-in',
    'El check-in devolvio la maleta con la carcasa rota y adentro el laptop. Reclamo por el dano del equipo.',
    'Alta', 'EnGestion', INTERVAL '40 hours', v_maria, 'Alta', 'Sugerida por tipo Equipaje');

  v_inc := upsert_incidente(v_tomas, NULL, 'Cobro_indebido',
    'Cargo por servicio que no solicite',
    'Me cobaron un paquete de upgrades que nunca contrate y no puedo cancelarlo desde la app.',
    'Baja', 'Resuelto', INTERVAL '-80 hours', v_carlos, 'Alta', 'Sugerida por tipo Cobro_indebido');
  PERFORM upsert_respuesta(v_inc, v_carlos, 'Anulamos el cargo y desactivamos la suscripcion. Ya te llega el reembolso.');

  -- Casos sin prioridad (sin triage) esperando en la cola del agente.
  v_inc := upsert_incidente(v_ana, NULL, 'Otro',
    'Consulta sobre equipaje de mano',
    'Quiero confirmar si puedo llevar una valija de cabina con el vuelo a Cancun.',
    NULL, 'Abierto', NULL, NULL, 'Baja', 'Sugerida por tipo Otro');
  PERFORM upsert_incidente(v_bruno, NULL, 'Otro',
    'Duda sobre el check-in online',
    'No me deja cargar el numero de pasaporte en el check-in online de la reserva de hotel.',
    NULL, 'Abierto', NULL, NULL, 'Baja', 'Sugerida por tipo Otro');

  -- Seguimientos de agentes (para la vista "Siguiendo").
  INSERT INTO incidente_seguidores (incidente_id, agente_id)
  SELECT id, v_lucia FROM incidentes WHERE titulo = 'Cobro fraudulento con tarjeta ajena'
  ON CONFLICT DO NOTHING;
  INSERT INTO incidente_seguidores (incidente_id, agente_id)
  SELECT id, v_lucia FROM incidentes WHERE titulo = 'El hotel no encuentra mi reserva'
  ON CONFLICT DO NOTHING;

  -- Historial de gestion de los casos ya tocados.
  INSERT INTO incidente_eventos (incidente_id, actor_id, accion, detalle, creado_at)
  SELECT id, v_agente, 'claim', NULL, now() - INTERVAL '5 hours'
  FROM incidentes WHERE titulo = 'Vuelo cancelado y varada en aeropuerto'
  AND NOT EXISTS (SELECT 1 FROM incidente_eventos e WHERE e.incidente_id = incidentes.id AND e.accion = 'claim');
END; $proc$;
