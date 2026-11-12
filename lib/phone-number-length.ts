import {
  Metadata,
  type CountryCode,
  type MetadataJson,
  type NumberingPlan,
} from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.max.json";

const maximumPhoneDigitsByCountry = new Map<string, number | null>();
const metadata = phoneMetadata as MetadataJson;

function hasNationalPrefix(
  numberingPlan: NumberingPlan,
): numberingPlan is NumberingPlan & { nationalPrefix: () => string } {
  return "nationalPrefix" in numberingPlan && typeof numberingPlan.nationalPrefix === "function";
}

export function getMaxNationalPhoneInputLength(countryCode: string): number | undefined {
  if (maximumPhoneDigitsByCountry.has(countryCode)) {
    return maximumPhoneDigitsByCountry.get(countryCode) ?? undefined;
  }

  if (!Object.hasOwn(metadata.countries, countryCode)) {
    maximumPhoneDigitsByCountry.set(countryCode, null);
    return undefined;
  }

  const numberingPlan = new Metadata(metadata);
  numberingPlan.selectNumberingPlan(countryCode as CountryCode);
  const countryPlan = numberingPlan.numberingPlan;
  const possibleLengths = countryPlan?.possibleLengths() ?? [];
  const maxPossibleLength = Math.max(0, ...possibleLengths);
  const nationalPrefix = countryPlan && hasNationalPrefix(countryPlan) ? countryPlan.nationalPrefix() : "";
  const nationalPrefixLength = typeof nationalPrefix === "string"
    ? nationalPrefix.replace(/\D/g, "").length
    : 0;
  const maximumLength = maxPossibleLength + nationalPrefixLength;

  maximumPhoneDigitsByCountry.set(countryCode, maximumLength || null);
  return maximumLength || undefined;
}
