// Login agente: sin registro público (los agentes los da un admin desde el panel).
import { LoginScreen as SharedLogin } from '../../shared/LoginScreen';

export function LoginScreen({ onSuccess }) {
  return (
    <SharedLogin
      onSuccess={onSuccess}
      roles={['agente', 'admin']}
      titulo="Centro de Resolución"
      subtitulo="Acceso interno de agentes y administradores."
    />
  );
}
