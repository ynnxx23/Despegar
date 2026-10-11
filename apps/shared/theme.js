// Tokens de diseño propios inspirados en Despegar (violeta + línea de viaje).
// No es copia exacta corporativa: implementación propia para el proyecto.
// Los colores de texto cumplen WCAG AA (>= 4.5:1) sobre fondo/card.
export const theme = {
  colors: {
    primary: '#6C2BD9',
    primaryDark: '#4A1FA3',
    accent: '#C2410C',        // naranja quemado (antes #FF6B35 no llegaba a 4.5:1)
    success: '#15803D',       // verde 700 (antes #16A34A daba 3.3:1)
    warning: '#B45309',       // ámbar oscuro (antes #F59E0B daba 2.15:1)
    critical: '#DC2626',      // bordes/estados
    criticalText: '#B91C1C',  // texto de error (5.6:1 sobre #FDECEC)
    background: '#F6F5FB',
    card: '#FFFFFF',
    text: '#1E1B2E',
    muted: '#5A6070',         // antes #6B7280 daba 4.46:1 sobre el fondo
    border: '#E5E7EB',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 16 },
  type: { title: 24, subtitle: 18, body: 16, caption: 14 },
  touch: 48,
  priority: { Baja: '#5A6070', Alta: '#C2410C', Critica: '#B91C1C' },
  status: { Abierto: '#B45309', EnGestion: '#6C2BD9', Resuelto: '#15803D' },
};
