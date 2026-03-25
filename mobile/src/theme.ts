export const Colors = {
  scarlet: '#CC0033',
  black: '#000000',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
  darkGray: '#333333',
  midGray: '#888888',
  errorRed: '#D32F2F',
  successGreen: '#2E7D32',
};

export const Typography = {
  heading: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.black,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.black,
  },
  body: {
    fontSize: 16,
    color: Colors.darkGray,
  },
  label: {
    fontSize: 14,
    color: Colors.midGray,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
