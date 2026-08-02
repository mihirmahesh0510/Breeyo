export const typography = {
  display: { fontSize: 45, lineHeight: 52, fontWeight: '400' as const },
  heading1: { fontSize: 32, lineHeight: 40, fontWeight: '400' as const },
  heading2: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const },
  subheading: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
    letterSpacing: 0.15,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0.4,
  },
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
} as const;
