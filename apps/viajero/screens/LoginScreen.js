// Login viajero: wrapper delgado del LoginScreen compartido (apps/shared).
// La validación, el estado de conexión y los avisos los maneja la capa común.
import { LoginScreen as LoginCompartido } from '../../shared/LoginScreen';

export function LoginScreen({ onSuccess, goRegister }) {
  return (
    <LoginCompartido
      titulo="Despegar · Ayuda al Viajero"
      subtitulo="Tus viajes y respuestas en un solo lugar."
      roles={['viajero']}
      permitirRegistro
      textoRegistro="Crear cuenta"
      goRegister={goRegister}
      onSuccess={onSuccess}
    />
  );
}
