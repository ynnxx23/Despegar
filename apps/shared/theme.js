// Tokens EVA reales de despegar.com.ar (snapshot oct-2026, desktop.5e8752f3.css):
// --brand-primary-1:#EBE5F5 -2:#A780FF -3:#4300D2 -4:#270570 (violeta)
// --brand-secondary-1:#FCE8E6 -2:#F6AEA7 -3:#E61A06 -4:#8A1004 (rojo coral)
// --brand-tertiary-1:#ECFDF9 -2:#CBF6EC -3:#ADEDDD -4:#077A7A (teal)
// Botones pill 24px (--button-border_radius), cards 8px, header blanco, logo violeta.
// Tipografía web eva-font (fallback Arial/sans); en móvil System bold para wordmark.
// Implementación propia con valores exactos, sin copiar assets.
export const brand = {
  name: 'despegar',
  logo: { symbol: 'D', wordmark: 'despegar' },
  violet: '#4300D2',
  violetLight: '#A780FF',
  violetTint: '#EBE5F5',
  violetDark: '#270570',
  coral: '#E61A06',
  coralDark: '#8A1004',
  coralTint: '#FCE8E6',
  teal: '#077A7A',
  tealTint: '#ECFDF9',
  sky: '#37BBED',
  blue: '#337FFF',
  font: { wordmark: 'System-bold', body: 'System' },
};
export const theme = {
  colors: {
    primary: '#4300D2',
    primaryDark: '#270570',
    primaryLight: '#A780FF',
    accent: '#E61A06',
    secondary: '#077A7A',
    secondaryBg: '#ECFDF9',
    info: '#337FFF',
    success: '#007D6D',
    warning: '#643902',
    critical: '#E61A06',
    criticalDark: '#8A1004',
    background: '#F5F5F5',
    card: '#FFFFFF',
    surfaceHighlight: '#EBE5F5',
    dangerBg: '#FCE8E6',
    warningBg: '#FFFBDB',
    text: '#1B182B',
    muted: '#535466',
    border: '#C0C4CC',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 8, pill: 24 },
  type: { title: 24, subtitle: 18, body: 16, caption: 14 },
  touch: 48,
  priority: { Baja: '#565A60', Alta: '#E61A06', Critica: '#8A1004' },
  status: { Abierto: '#643902', EnGestion: '#4300D2', Resuelto: '#007D6D' },
};
