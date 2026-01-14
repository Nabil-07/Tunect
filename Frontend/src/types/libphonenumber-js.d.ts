declare module 'libphonenumber-js' {
  export type CountryCode = string;
  export function getCountryCallingCode(code: CountryCode): string;
}
