// theme.ts — App-wide design tokens.
//
// Centralizes colors, typography styles, and spacing values so that all screens
// use consistent visuals without hardcoding hex codes or numbers inline.
// Import named exports (Colors, Typography, Spacing) directly in each screen file.
//
// Brand colors follow the SoleSignal color palette:
//   Primary: Scarlet (#CC0033) — used for headers, primary buttons, and active states
//   Neutral: Black/white/grays — used for text and backgrounds

// Color palette — import Colors.scarlet instead of hardcoding '#CC0033'
export const Colors = {
  scarlet: '#CC0033',    // Primary brand color — header backgrounds, primary buttons
  black: '#000000',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',  // Screen backgrounds, input fields
  darkGray: '#333333',   // Body text
  midGray: '#888888',    // Label text, secondary/disabled states
  errorRed: '#D32F2F',   // Error messages and destructive action highlights
  successGreen: '#2E7D32', // Success states (e.g. "Alert sent", "Connected")
};

// Reusable text style objects — spread these into StyleSheet definitions.
// The `as const` assertion on fontWeight is required because TypeScript infers
// string instead of the literal union type ('700') that React Native expects.
export const Typography = {
  heading: {
    fontSize: 24,
    fontWeight: '700' as const, // bold — used for screen titles
    color: Colors.black,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600' as const, // semibold — used for section headers
    color: Colors.black,
  },
  body: {
    fontSize: 16,
    color: Colors.darkGray,     // standard readable text
  },
  label: {
    fontSize: 14,
    color: Colors.midGray,      // secondary/helper text
  },
};

// Spacing scale — used for margin, padding, and gap values.
// Consistent increments make layouts predictable without magic numbers.
export const Spacing = {
  xs: 4,   // tight internal padding (e.g. between icon and label)
  sm: 8,   // small gaps between related elements
  md: 16,  // standard padding inside cards and form fields
  lg: 24,  // larger section gaps
  xl: 32,  // top/bottom padding for full-screen sections
};
