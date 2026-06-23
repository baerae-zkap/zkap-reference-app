/**
 * Semantic color constants using hex values for use in StyleSheet.create().
 * Values are sourced from the palette and token system.
 */
export const colors = {
  text: {
    primary: '#0F172A',    // blueGray900
    secondary: '#64748B',  // blueGray500
    tertiary: '#94A3B8',   // blueGray400 (placeholder)
  },
  background: {
    primary: '#FFFFFF',    // white
    secondary: '#F8FAFC',  // blueGray50
  },
  border: {
    light: '#F1F5F9',      // blueGray100
    default: '#E2E8F0',    // blueGray200
  },
  brand: {
    default: '#3B82F6',    // blue500
    surface: '#EFF6FF',    // blue50
  },
  error: {
    default: '#EF4444',    // red500
    surface: '#FEF2F2',    // red50
  },
} as const;
