import React from 'react';
import { Divider as PaperDivider } from 'react-native-paper';

// --- Component ---

export interface BreeyoDividerProps {
  inset?: boolean;
}

export function BreeyoDivider({ inset = false }: BreeyoDividerProps) {
  return React.createElement(PaperDivider, {
    style: inset ? { marginLeft: 72 } : undefined,
  });
}
