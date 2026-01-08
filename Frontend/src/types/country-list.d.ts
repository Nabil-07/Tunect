declare module 'country-list' {
  export function getNames(): Record<string, string>;
  export function getName(code: string): string | undefined;
}
