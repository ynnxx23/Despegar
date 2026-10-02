<?php
// Itinerario: GET /api/itinerario (viajero ve solo sus reservas).
class ItinerarioController {
  public static function show(PDO $db, array $claims): void {
    $r = new Reserva($db);
    Response::json(['data' => $r->listByUser((int)$claims['sub'])], 200);
  }
}
