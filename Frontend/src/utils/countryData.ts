// src/utils/countryData.ts
import { getNames } from "country-list";
import { getCountryCallingCode } from "libphonenumber-js";
import type { CountryCode as PhoneCC } from "libphonenumber-js";

export type CountryOption = {
  code: string;     // ISO-3166-1 alpha-2 (IN, AE, US, ...)
  name: string;     // "India", "United Arab Emirates", ...
  dialCode: string; // "+91", "+971", ...
};

let _cache: CountryOption[] | null = null;

/** Get all countries with ISO codes and dial codes (sorted by name). */
export function getCountries(): CountryOption[] {
  if (_cache) return _cache;

  const names = getNames(); // { IN: "India", AE: "United Arab Emirates", ... }

  const options: CountryOption[] = Object.keys(names).map((code) => {
    let dial = "";
    try {
      // CountryCode is a *type*, not a runtime export. Cast for TS only.
      dial = `+${getCountryCallingCode(code as PhoneCC)}`;
    } catch {
      dial = ""; // unknown by libphonenumber-js (rare), leave blank
    }
    return { code, name: names[code], dialCode: dial };
  });

  options.sort((a, b) => a.name.localeCompare(b.name));
  _cache = options;
  return options;
}

export function findCountry(code: string): CountryOption | undefined {
  return getCountries().find((c) => c.code === code);
}
