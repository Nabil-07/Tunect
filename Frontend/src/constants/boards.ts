export const BOARD_OPTIONS = [
  'CBSE',
  'ICSE',
  'State Board',
  'British Board',
  'IB',
  'Cambridge',
  'American Curriculum',
] as const;

export type BoardOption = (typeof BOARD_OPTIONS)[number];
