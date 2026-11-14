"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addressDataSchema, type AddressData } from "@/lib/geography/address-data";
import {
  compareCallingCodes,
  compareGeographyNames,
  comparePostalCodes,
} from "@/lib/geography/sorting";
import { normalizePhoneNumber, parseInternationalPhoneNumber } from "@/lib/phone-number";

type SourceType = "external_api" | "external_dataset" | "local_dataset" | "local_metadata" | "manual";

type LocationRecord = {
  name: string;
  type: "country" | "administrative_area" | "city" | "suburb" | "street" | "postal_code";
  source: string;
  sourceType: SourceType;
  isManual: boolean;
  code?: string;
  level?: number;
  externalId?: string;
};

type CountryOption = {
  name: string;
  alpha2Code: string;
  callingCodes: string[];
  nationalNumberMaxLength?: number;
  flag?: string;
  source?: string;
  sourceType?: SourceType;
  isManual?: boolean;
};

type PostalCodeOption = {
  postalCode: string;
  source?: string;
  sourceType?: SourceType;
  isManual?: boolean;
  type?: string;
};

type RegionOption = {
  id?: string;
  name: string;
  code: string;
  level?: number;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
  source?: string;
  sourceType?: SourceType;
  isManual?: boolean;
};

type CityOption = {
  name: string;
  countryCode: string;
  geonameId?: number;
  featureCode?: string;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  source?: string;
  sourceType?: SourceType;
  isManual?: boolean;
};

type CountryLoadStatus = "loading" | "ready" | "error";

let countryOptionsRequest: Promise<CountryOption[]> | undefined;

function isCountryOption(value: unknown): value is CountryOption {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && "alpha2Code" in value
    && typeof value.alpha2Code === "string"
    && "callingCodes" in value
    && Array.isArray(value.callingCodes)
    && value.callingCodes.every((code) => typeof code === "string")
    && (!("nationalNumberMaxLength" in value)
      || (typeof value.nationalNumberMaxLength === "number"
        && Number.isInteger(value.nationalNumberMaxLength)
        && value.nationalNumberMaxLength > 0))
    && (!("flag" in value) || typeof value.flag === "string");
}

function isCityOption(value: unknown): value is CityOption {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && "countryCode" in value
    && typeof value.countryCode === "string";
}

function isRegionOption(value: unknown): value is RegionOption {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && "code" in value
    && typeof value.code === "string";
}

function isPostalCodeOption(value: unknown): value is PostalCodeOption {
  return typeof value === "object"
    && value !== null
    && "postalCode" in value
    && typeof value.postalCode === "string";
}

function readAddressData(value: string | null | undefined): AddressData | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    const result = addressDataSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function manualLocationRecord(name: string, type: LocationRecord["type"]): LocationRecord | null {
  const trimmedName = name.trim();
  return trimmedName
    ? { name: trimmedName, type, source: "manual", sourceType: "manual", isManual: true }
    : null;
}

function uniqueAddressParts(values: string[]) {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const part = value.trim();
    const key = part
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+(city|district|county|region|province|state|territory)$/i, "");
    if (part && !seen.has(key)) {
      seen.add(key);
      parts.push(part);
    }
  }
  return parts;
}

function limitPhoneNumberDigits(value: string, maximumDigits: number) {
  let digitCount = 0;
  return [...value].filter((character) => {
    if (!/\d/.test(character)) return true;
    digitCount += 1;
    return digitCount <= maximumDigits;
  }).join("");
}

function loadCountryOptions() {
  if (!countryOptionsRequest) {
    countryOptionsRequest = fetch("/api/geography?type=countries")
      .then(async (response) => {
        if (!response.ok) throw new Error("Country options are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCountryOption)) {
          throw new Error("Country options returned an invalid response.");
        }
        return data.sort((a, b) => compareGeographyNames(a.name, b.name));
      })
      .catch((error: unknown) => {
        countryOptionsRequest = undefined;
        throw error;
      });
  }

  return countryOptionsRequest;
}

function useCountryOptions() {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [status, setStatus] = useState<CountryLoadStatus>("loading");

  useEffect(() => {
    let active = true;
    loadCountryOptions()
      .then((options) => {
        if (!active) return;
        setCountries(options);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return { countries, status };
}

export function CountryCityFields({
  initialCountry = "",
  initialCity = "",
  initialRegion = "",
  initialPostalCode,
  initialAddressData = "",
  initialAddress = "",
  countryError,
  cityError,
  regionError,
  postalError,
  addressError,
  addressDataError,
  disabled = false,
  showRegion = false,
  showPostalCode = false,
  onCountryCodeChange,
  phoneCountrySelection,
}: {
  initialCountry?: string;
  initialCity?: string;
  initialRegion?: string;
  initialPostalCode?: string;
  initialAddressData?: string | null;
  initialAddress?: string;
  countryError?: string;
  cityError?: string;
  regionError?: string;
  postalError?: string;
  addressError?: string;
  addressDataError?: string;
  disabled?: boolean;
  showRegion?: boolean;
  showPostalCode?: boolean;
  onCountryCodeChange?: (countryCode: string) => void;
  phoneCountrySelection?: { countryCode: string; version: number } | null;
}) {
  const { countries, status } = useCountryOptions();
  const id = useId();
  const savedAddressData = readAddressData(initialAddressData);
  const savedAddressText = savedAddressData
    ? uniqueAddressParts([
        savedAddressData.unitNumber ? `Unit ${savedAddressData.unitNumber}` : "",
        savedAddressData.houseNumber,
        savedAddressData.street?.name ?? "",
        savedAddressData.buildingName,
        savedAddressData.additionalAddress,
        ]).join(" ")
    : initialAddress;
  const processedPhoneCountryVersion = useRef(0);
  const [country, setCountry] = useState(initialCountry);
  const [countryCode, setCountryCode] = useState(savedAddressData?.countryCode ?? "");
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [activeCountryIndex, setActiveCountryIndex] = useState(-1);
  const [city, setCity] = useState(initialCity);
  const [cityRecord, setCityRecord] = useState<LocationRecord | null>(savedAddressData?.city ?? null);
  const [region, setRegion] = useState(initialRegion);
  const [regionRecord, setRegionRecord] = useState<LocationRecord | null>(
    savedAddressData?.administrativeAreas[0] ?? null,
  );
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [regionLookupError, setRegionLookupError] = useState(false);
  const [regionLookupPending, setRegionLookupPending] = useState(false);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [activeRegionIndex, setActiveRegionIndex] = useState(-1);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [cityLookupError, setCityLookupError] = useState(false);
  const [cityLookupPending, setCityLookupPending] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [activeCityIndex, setActiveCityIndex] = useState(-1);
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? "");
  const [postalCodeRecord, setPostalCodeRecord] = useState<LocationRecord | null>(savedAddressData?.postalCode ?? null);
  const [postalCodeOptions, setPostalCodeOptions] = useState<PostalCodeOption[]>([]);
  const [postalLookupPending, setPostalLookupPending] = useState(false);
  const [postalLookupMessage, setPostalLookupMessage] = useState("");
  const [streetRecord, setStreetRecord] = useState<LocationRecord | null>(savedAddressData?.street ?? null);
  const [additionalAddress, setAdditionalAddress] = useState(savedAddressText);
  const cityQuery = city.trim();
  const countryQuery = country.trim().toLocaleLowerCase();
  const matchingCountries = countryQuery.length === 2
    ? countries.filter((option) => option.alpha2Code.toLocaleLowerCase() === countryQuery)
    : countries.filter((option) =>
        option.name.toLocaleLowerCase().includes(countryQuery)
        || option.alpha2Code.toLocaleLowerCase().includes(countryQuery),
      );
  const regionQuery = region.trim().toLocaleLowerCase();
  const matchingRegions = regions.filter((option) =>
    option.name.toLocaleLowerCase().includes(regionQuery),
  );
  const regionListboxId = `${id}-region-options`;

  useEffect(() => {
    if (status !== "ready") return;
    const selected = countries.find(
      (option) => option.name.toLocaleLowerCase() === country.toLocaleLowerCase(),
    );
    setCountryCode(selected?.alpha2Code ?? "");
  }, [countries, country, status]);

  useEffect(() => {
    onCountryCodeChange?.(countryCode);
  }, [countryCode, onCountryCodeChange]);

  useEffect(() => {
    if (
      status !== "ready"
      || !phoneCountrySelection
      || phoneCountrySelection.version === processedPhoneCountryVersion.current
    ) {
      return;
    }

    processedPhoneCountryVersion.current = phoneCountrySelection.version;
    const selected = countries.find(
      (option) => option.alpha2Code === phoneCountrySelection.countryCode,
    );
    if (!selected) return;

    setCountry(selected.name);
    setCountryCode(selected.alpha2Code);
    setCountryMenuOpen(false);
    setCity("");
    setCityRecord(null);
    setRegion("");
    setRegionRecord(null);
    setRegionMenuOpen(false);
    setCityOptions([]);
    setCityMenuOpen(false);
    setPostalCode("");
    setPostalCodeRecord(null);
    clearAddressDetails();
  }, [countries, phoneCountrySelection, status]);

  useEffect(() => {
    if (!showRegion || !countryCode || !country) {
      setRegions([]);
      setRegionLookupError(false);
      setRegionLookupPending(false);
      return;
    }

    const controller = new AbortController();
    setRegions([]);
    setRegionLookupError(false);
    setRegionLookupPending(true);

    const params = new URLSearchParams({
      type: "regions",
      country: countryCode,
      countryName: country,
    });

    fetch(`/api/geography?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Region options are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isRegionOption)) {
          throw new Error("Region options returned an invalid response.");
        }
        return data.sort((a, b) => compareGeographyNames(a.name, b.name));
      })
      .then(setRegions)
      .catch(() => {
        if (!controller.signal.aborted) setRegionLookupError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRegionLookupPending(false);
      });

    return () => controller.abort();
  }, [country, countryCode, showRegion]);

  useEffect(() => {
    const cityLookupIsReady = Boolean(countryCode && cityQuery.length >= 2);
    if (!cityLookupIsReady) {
      setCityOptions([]);
      setCityLookupError(false);
      setCityLookupPending(false);
      return;
    }

    const controller = new AbortController();
    setCityLookupPending(true);
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          type: "cities",
          country: countryCode,
          q: cityQuery,
        });
        if (showRegion && region) {
          params.set("region", region);
          const regionOption = regions.find(
            (option) => option.name.toLocaleLowerCase() === region.toLocaleLowerCase(),
          );
          const firstAdminCode = regionOption?.code ?? regionRecord?.code;
          if (firstAdminCode) params.set("admin1", firstAdminCode);
        }
        const response = await fetch(`/api/geography?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City suggestions are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCityOption)) {
          throw new Error("City suggestions returned an invalid response.");
        }
        const uniqueOptions = new Map<string, CityOption>();
        for (const option of data) {
          const key = option.name.normalize("NFKC").trim().toLocaleLowerCase();
          if (key && !uniqueOptions.has(key)) uniqueOptions.set(key, option);
        }
        setCityOptions([...uniqueOptions.values()].sort((a, b) => compareGeographyNames(a.name, b.name)));
        setActiveCityIndex(-1);
        setCityLookupError(false);
      } catch {
        if (!controller.signal.aborted) {
          setCityOptions([]);
          setCityLookupError(true);
        }
      } finally {
        if (!controller.signal.aborted) setCityLookupPending(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cityQuery, countryCode, region, regionRecord, regions, showRegion]);

  useEffect(() => {
    if (!showPostalCode || !countryCode || !city) {
      setPostalCodeOptions([]);
      setPostalLookupPending(false);
      setPostalLookupMessage("");
      return;
    }
    const controller = new AbortController();
    setPostalCodeOptions([]);
    setPostalLookupPending(true);
    setPostalLookupMessage("");

    async function loadPostalCodes() {
      try {
        const params = new URLSearchParams({
          type: "postal-codes",
          country: countryCode,
          city,
          region,
        });
        if (regionRecord?.code) params.set("admin1", regionRecord.code);
        const response = await fetch(`/api/geography?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Postal code options are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isPostalCodeOption)) {
          throw new Error("Postal code lookup returned an invalid response.");
        }
        const options = [...new Map(data
          .filter((item) => item.postalCode.trim())
          .map((item) => [item.postalCode.trim(), item]))
          .values()]
          .sort((a, b) => comparePostalCodes(a.postalCode, b.postalCode));
        setPostalCodeOptions(options);
        if (options.length === 0) {
          setPostalLookupMessage("No postal codes found for this city.");
        }
      } catch {
        if (!controller.signal.aborted) {
          setPostalLookupMessage("Postal code options are unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setPostalLookupPending(false);
        }
      }
    }

    void loadPostalCodes();
    return () => {
      controller.abort();
    };
  }, [city, countryCode, region, regionRecord, showPostalCode]);

  function chooseCity(option: CityOption) {
    const value = option.name;
    setCity(value);
    setCityRecord({
      name: value,
      type: "city",
      source: option.source ?? "manual",
      sourceType: option.sourceType ?? "manual",
      isManual: option.isManual ?? true,
      ...(option.geonameId === undefined ? {} : { externalId: String(option.geonameId) }),
    });
    setPostalCode("");
    setPostalCodeRecord(null);
    clearAddressDetails();
    setCityMenuOpen(false);
    setActiveCityIndex(-1);
  }

  function changeRegion(value: string, selectedOption?: RegionOption) {
    const option = selectedOption ?? regions.find(
      (item) => item.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
    );
    setRegion(value);
    setRegionRecord(option
      ? {
          name: option.name,
          type: "administrative_area",
          code: option.code,
          level: option.level ?? 1,
          source: option.source ?? "GeoNames",
          sourceType: option.sourceType ?? "external_dataset",
          isManual: option.isManual ?? false,
        }
      : manualLocationRecord(value, "administrative_area"));
    setCity("");
    setCityRecord(null);
    setPostalCode("");
    setPostalCodeRecord(null);
    setCityOptions([]);
    setCityMenuOpen(false);
    clearAddressDetails();
    setActiveRegionIndex(-1);
  }

  function chooseRegion(option: RegionOption) {
    changeRegion(option.name, option);
    setRegionMenuOpen(false);
  }

  function handleRegionKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setRegionMenuOpen(false);
      setActiveRegionIndex(-1);
    } else if (event.key === "ArrowDown" && matchingRegions.length > 0) {
      event.preventDefault();
      setRegionMenuOpen(true);
      setActiveRegionIndex((index) => (index + 1) % matchingRegions.length);
    } else if (event.key === "ArrowUp" && matchingRegions.length > 0) {
      event.preventDefault();
      setRegionMenuOpen(true);
      setActiveRegionIndex((index) => (index <= 0 ? matchingRegions.length - 1 : index - 1));
    } else if (event.key === "Enter" && regionMenuOpen && activeRegionIndex >= 0) {
      event.preventDefault();
      chooseRegion(matchingRegions[activeRegionIndex]);
    }
  }

  function changeCountry(nextCountry: string) {
    const selected = countries.find((option) =>
      option.name.toLocaleLowerCase() === nextCountry.trim().toLocaleLowerCase(),
    );
    setCountry(selected?.name ?? nextCountry);
    setCountryCode(selected?.alpha2Code ?? "");
    setActiveCountryIndex(-1);
    setCity("");
    setCityRecord(null);
    setRegion("");
    setRegionRecord(null);
    setRegionMenuOpen(false);
    setCityOptions([]);
    setCityMenuOpen(false);
    setPostalCode("");
    setPostalCodeRecord(null);
    clearAddressDetails();
  }

  function chooseCountry(option: CountryOption) {
    changeCountry(option.name);
    setCountryMenuOpen(false);
  }

  function handleCountryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setCountryMenuOpen(false);
      setActiveCountryIndex(-1);
    } else if (event.key === "ArrowDown" && matchingCountries.length > 0) {
      event.preventDefault();
      setCountryMenuOpen(true);
      setActiveCountryIndex((index) => (index + 1) % matchingCountries.length);
    } else if (event.key === "ArrowUp" && matchingCountries.length > 0) {
      event.preventDefault();
      setCountryMenuOpen(true);
      setActiveCountryIndex((index) => (index <= 0 ? matchingCountries.length - 1 : index - 1));
    } else if (event.key === "Enter" && countryMenuOpen && activeCountryIndex >= 0) {
      event.preventDefault();
      chooseCountry(matchingCountries[activeCountryIndex]);
    }
  }

  function clearAddressDetails() {
    setStreetRecord(null);
    setAdditionalAddress("");
  }

  function handleCityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setCityMenuOpen(false);
      setActiveCityIndex(-1);
    } else if (event.key === "ArrowDown" && cityOptions.length > 0) {
      event.preventDefault();
      setCityMenuOpen(true);
      setActiveCityIndex((index) => (index + 1) % cityOptions.length);
    } else if (event.key === "ArrowUp" && cityOptions.length > 0) {
      event.preventDefault();
      setCityMenuOpen(true);
      setActiveCityIndex((index) => (index <= 0 ? cityOptions.length - 1 : index - 1));
    } else if (event.key === "Enter" && cityMenuOpen && activeCityIndex >= 0) {
      event.preventDefault();
      chooseCity(cityOptions[activeCityIndex]);
    }
  }

  const selectedCountryOption = countries.find((option) => option.name === country);
  const countryLocation: LocationRecord | null = country
    ? {
        name: country,
        type: "country",
        source: selectedCountryOption?.source ?? "manual",
        sourceType: selectedCountryOption?.sourceType ?? "manual",
        isManual: selectedCountryOption?.isManual ?? !selectedCountryOption,
        ...(countryCode ? { code: countryCode } : {}),
      }
    : null;
  const selectedRegionOption = regions.find(
    (option) => option.name.toLocaleLowerCase() === region.toLocaleLowerCase(),
  );
  const currentRegionRecord: LocationRecord | null = region
    ? selectedRegionOption
      ? {
          name: selectedRegionOption.name,
          type: "administrative_area",
          code: selectedRegionOption.code,
          level: selectedRegionOption.level ?? 1,
          source: selectedRegionOption.source ?? "GeoNames",
          sourceType: selectedRegionOption.sourceType ?? "external_dataset",
          isManual: selectedRegionOption.isManual ?? false,
        }
      : regionRecord?.name.toLocaleLowerCase() === region.toLocaleLowerCase()
        ? regionRecord
        : manualLocationRecord(region, "administrative_area")
    : null;
  const currentCityRecord = cityRecord?.name.toLocaleLowerCase() === city.trim().toLocaleLowerCase()
    ? cityRecord
    : manualLocationRecord(city, "city");
  const currentPostalCodeRecord = postalCodeRecord?.name === postalCode.trim()
    ? postalCodeRecord
    : postalCode.trim()
      ? (() => {
          const option = postalCodeOptions.find((item) => item.postalCode === postalCode.trim());
          return {
            name: postalCode.trim(),
            type: "postal_code" as const,
            source: option?.source ?? "manual",
            sourceType: option?.sourceType ?? "manual",
            isManual: option?.isManual ?? !option,
          };
        })()
      : null;
  const addressData: AddressData = {
    countryCode: countryCode || null,
    country: countryLocation,
    administrativeAreas: currentRegionRecord ? [currentRegionRecord] : [],
    city: currentCityRecord,
    suburb: null,
    street: streetRecord,
    postalCode: currentPostalCodeRecord,
    houseNumber: "",
    buildingName: "",
    unitNumber: "",
    additionalAddress,
  };
  const addressDataJson = JSON.stringify(addressData);
  const addressPreview = uniqueAddressParts([
    ...additionalAddress.split(/[,\n]/),
    city,
    region,
    postalCode,
    country,
  ]).join(", ");
  const cityInputDisabled = disabled || (!country && status !== "error");
  const countryListboxId = `${id}-country-options`;
  const cityListboxId = `${id}-city-options`;

  return (
    <>
      <input type="hidden" name="countryCode" value={countryCode} />
      <input type="hidden" name="addressData" value={addressDataJson} />
      <input type="hidden" name="address" value={addressPreview} />
      <div className="gg-field">
        <label className="gg-label" htmlFor={`${id}-country`}>
          Country <span className="gg-req">*</span>
        </label>
        <div className="geography-country-control">
          <input
            className="gg-input"
            id={`${id}-country`}
            name="country"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={countryMenuOpen}
            aria-controls={countryMenuOpen ? countryListboxId : undefined}
            aria-activedescendant={countryMenuOpen && activeCountryIndex >= 0
              ? `${countryListboxId}-${activeCountryIndex}`
              : undefined}
            autoComplete="country-name"
            maxLength={100}
            value={country}
            placeholder={status === "loading" ? "Loading countries..." : "Search or enter a country"}
            onFocus={() => setCountryMenuOpen(true)}
            onBlur={() => setCountryMenuOpen(false)}
            onChange={(event) => {
              changeCountry(event.target.value);
              setCountryMenuOpen(true);
            }}
            onKeyDown={handleCountryKeyDown}
            required
            aria-invalid={Boolean(countryError)}
            aria-describedby={countryError ? `${id}-country-error` : status === "error" ? `${id}-country-hint` : undefined}
            aria-busy={status === "loading"}
            disabled={disabled}
          />
          {countryMenuOpen && (
            <div
              className="geography-city-dropdown"
              id={countryListboxId}
              role="listbox"
              aria-label="Country suggestions"
            >
              {status === "loading" ? (
                <span className="geography-city-message" role="status">Loading countries...</span>
              ) : matchingCountries.length === 0 ? (
                <span className="geography-city-message">
                  {status === "error"
                    ? "Country options are unavailable. You can enter the country manually."
                    : "No matching countries. You can enter the country manually."}
                </span>
              ) : (
                matchingCountries.map((option, index) => (
                  <button
                    className="geography-city-option"
                    id={`${countryListboxId}-${index}`}
                    key={option.alpha2Code}
                    type="button"
                    role="option"
                    aria-selected={activeCountryIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCountry(option)}
                  >
                    {option.flag ? `${option.flag} ` : ""}{option.name} ({option.alpha2Code})
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {status === "loading" && !countryMenuOpen && (
          <span className="gg-caption" role="status">Loading country options...</span>
        )}
        {status === "error" && (
          <span className="gg-caption" id={`${id}-country-hint`}>
            Country options are unavailable; enter the country manually.
          </span>
        )}
        {countryError && <span className="warehouse-field-error" id={`${id}-country-error`}>{countryError}</span>}
      </div>

      {showRegion && countryCode && (
        <div className="gg-field">
          <label className="gg-label" htmlFor={`${id}-region`}>Region</label>
          <div className="geography-region-control">
            <input
              className="gg-input"
              id={`${id}-region`}
              name="region"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={regionMenuOpen}
              aria-controls={regionMenuOpen ? regionListboxId : undefined}
              aria-activedescendant={activeRegionIndex >= 0 ? `${regionListboxId}-${activeRegionIndex}` : undefined}
              autoComplete="address-level1"
              maxLength={100}
              placeholder={regionLookupPending ? "Loading regions..." : "Search or enter a region"}
              value={region}
              onFocus={() => setRegionMenuOpen(true)}
              onBlur={() => setRegionMenuOpen(false)}
              onChange={(event) => {
                changeRegion(event.target.value);
                setRegionMenuOpen(true);
              }}
              onKeyDown={handleRegionKeyDown}
              disabled={disabled || !countryCode}
              aria-invalid={Boolean(regionError)}
              aria-describedby={regionError
                ? `${id}-region-error`
                : regionLookupError
                  ? `${id}-region-hint`
                  : undefined}
              aria-busy={regionLookupPending}
            />
            {regionMenuOpen && (
              <div
                className="geography-city-dropdown"
                id={regionListboxId}
                role="listbox"
                aria-label="Region suggestions"
              >
                {regionLookupPending ? (
                  <span className="geography-city-message" role="status">Loading regions...</span>
                ) : matchingRegions.length === 0 ? (
                  <span className="geography-city-message">
                    No matching regions. You can enter the region manually.
                  </span>
                ) : (
                  matchingRegions.map((option, index) => (
                    <button
                      className="geography-city-option"
                      id={`${regionListboxId}-${index}`}
                      key={`${option.name}-${option.code}`}
                      type="button"
                      role="option"
                      aria-selected={activeRegionIndex === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseRegion(option)}
                    >
                      {option.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {regionLookupError && (
            <span className="gg-caption" id={`${id}-region-hint`} role="status">
              Region options are unavailable. You can enter the region manually.
            </span>
          )}
          {regionError && <span className="warehouse-field-error" id={`${id}-region-error`}>{regionError}</span>}
          {regionLookupPending && <span className="gg-caption" role="status">Loading regions...</span>}
        </div>
      )}

      {countryCode && (!showRegion || region.trim()) && (
        <>
          <div className="gg-field">
            <label className="gg-label" htmlFor={`${id}-city`}>
              City <span className="gg-req">*</span>
            </label>
            <div className="geography-city-control">
              <input
                className="gg-input"
                id={`${id}-city`}
                name="city"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(countryCode && cityMenuOpen)}
                aria-controls={countryCode && cityMenuOpen ? cityListboxId : undefined}
                aria-activedescendant={activeCityIndex >= 0 ? `${cityListboxId}-${activeCityIndex}` : undefined}
                placeholder={country ? "Search or enter a city" : "Select a country first"}
                autoComplete="address-level2"
                maxLength={100}
                value={city}
                onFocus={() => {
                  if (countryCode) setCityMenuOpen(true);
                }}
                onBlur={() => setCityMenuOpen(false)}
                onChange={(event) => {
                  const value = event.target.value;
                  const option = cityOptions.find(
                    (item) => item.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
                  );
                  setCity(value);
                  setCityRecord(option
                    ? {
                        name: option.name,
                        type: "city",
                        source: option.source ?? "manual",
                        sourceType: option.sourceType ?? "manual",
                        isManual: option.isManual ?? true,
                        ...(option.geonameId === undefined ? {} : { externalId: String(option.geonameId) }),
                      }
                    : manualLocationRecord(value, "city"));
                  setPostalCode("");
                  setPostalCodeRecord(null);
                  clearAddressDetails();
                  setCityMenuOpen(Boolean(countryCode));
                  setActiveCityIndex(-1);
                }}
                onKeyDown={handleCityKeyDown}
                required
                aria-invalid={Boolean(cityError)}
                aria-describedby={cityError ? `${id}-city-error` : cityLookupError ? `${id}-city-hint` : undefined}
                disabled={cityInputDisabled}
              />
              {countryCode && cityMenuOpen && (
                <div className="geography-city-dropdown" id={cityListboxId} role="listbox" aria-label="City suggestions">
                  {cityLookupPending ? (
                    <span className="geography-city-message" role="status">Loading cities...</span>
                  ) : cityLookupError ? (
                    <span className="geography-city-message" role="status">No city suggestions available.</span>
                  ) : city.trim().length < 2 ? (
                    <span className="geography-city-message">Type at least 2 characters to search.</span>
                  ) : cityOptions.length === 0 ? (
                    <span className="geography-city-message">No matching cities. You can enter the city manually.</span>
                  ) : (
                    cityOptions.map((option, index) => (
                      <button
                        className="geography-city-option"
                        id={`${cityListboxId}-${index}`}
                        key={`${option.name}-${option.geonameId ?? "countries-dev"}`}
                        type="button"
                        role="option"
                        aria-selected={activeCityIndex === index}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseCity(option)}
                      >
                        {option.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {cityLookupError && (
              <span className="gg-caption" id={`${id}-city-hint`}>
                City suggestions are unavailable; enter the city manually.
              </span>
            )}
            {cityError && <span className="warehouse-field-error" id={`${id}-city-error`}>{cityError}</span>}
          </div>

          {showPostalCode && city && (
            <div className="gg-field">
              <label className="gg-label" htmlFor={`${id}-postal`}>Postal Code</label>
              <input
                className="gg-input"
                id={`${id}-postal`}
                name="zipCode"
                type="text"
                autoComplete="postal-code"
                maxLength={20}
                list={`${id}-postal-options`}
                placeholder="Enter a postal code"
                value={postalCode}
                onChange={(event) => {
                  const value = event.target.value;
                  const option = postalCodeOptions.find((item) => item.postalCode === value);
                  setPostalCode(value);
                  setPostalCodeRecord(option
                    ? {
                        name: option.postalCode,
                        type: "postal_code",
                        source: option.source ?? "GeoNames",
                        sourceType: option.sourceType ?? "external_dataset",
                        isManual: option.isManual ?? false,
                      }
                    : manualLocationRecord(value, "postal_code"));
                }}
                aria-invalid={Boolean(postalError)}
                aria-describedby={postalError || postalLookupMessage ? `${id}-postal-hint` : undefined}
                aria-busy={postalLookupPending}
                disabled={disabled}
              />
              <datalist id={`${id}-postal-options`}>
                {postalCodeOptions.map((option) => <option key={option.postalCode} value={option.postalCode} />)}
              </datalist>
              {postalLookupPending && (
                <span className="gg-caption" id={`${id}-postal-hint`} role="status">Loading postal codes...</span>
              )}
              {!postalLookupPending && postalLookupMessage && (
                <span className="gg-caption" id={`${id}-postal-hint`} role="status">{postalLookupMessage}</span>
              )}
              {postalError && <span className="warehouse-field-error" id={`${id}-postal-error`}>{postalError}</span>}
            </div>
          )}

          {city && (
            <>
              <div className="gg-field warehouse-address">
                <label className="gg-label" htmlFor={`${id}-address`}>Address</label>
                <textarea
                  className="gg-textarea"
                  id={`${id}-address`}
                  maxLength={500}
                  value={additionalAddress}
                  onChange={(event) => {
                    const value = event.target.value;
                    clearAddressDetails();
                    setAdditionalAddress(value);
                  }}
                  disabled={disabled}
                  style={{ minHeight: 90 }}
                />
              </div>
              <div className="gg-field warehouse-address" aria-live="polite">
                <span className="gg-label">Address Preview</span>
                <p className="gg-caption">{addressPreview || "Enter location details to build an address preview."}</p>
                {(addressError || addressDataError) && (
                  <span className="warehouse-field-error">{addressError || addressDataError}</span>
                )}
              </div>
            </>
          )}
        </>
      )}

    </>
  );
}

export function PhoneNumberInput({
  defaultValue = "",
  error,
  disabled = false,
  required = false,
  maxLength = 40,
  label = "Phone Number",
  countryCode = "",
  onCountryCodeChange,
}: {
  defaultValue?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  label?: string;
  countryCode?: string;
  onCountryCodeChange?: (countryCode: string) => void;
}) {
  const { countries, status } = useCountryOptions();
  const controlId = useId();
  const initialized = useRef(false);
  const [callingCodeSelection, setCallingCodeSelection] = useState("");
  const [localNumber, setLocalNumber] = useState(defaultValue);
  const [phoneNumber, setPhoneNumber] = useState(defaultValue);
  const dialOptions = countries.flatMap((country) =>
    country.callingCodes
      .filter((callingCode) => /^\d+$/.test(callingCode))
      .map((callingCode) => ({
        key: `${country.alpha2Code}:${callingCode}`,
        countryCode: country.alpha2Code,
        flag: country.flag,
        callingCode,
        nationalNumberMaxLength: country.nationalNumberMaxLength,
      })),
  ).sort((a, b) =>
    compareCallingCodes(a.callingCode, b.callingCode)
    || compareGeographyNames(a.countryCode, b.countryCode),
  );

  useEffect(() => {
    if (status !== "ready" || initialized.current) return;
    initialized.current = true;
    const normalizedDefaultValue = normalizePhoneNumber(defaultValue);
    const match = [...dialOptions]
      .sort((a, b) => b.callingCode.length - a.callingCode.length)
      .find((option) => normalizedDefaultValue.startsWith(`+${option.callingCode}`));

    if (match) {
      setCallingCodeSelection(match.key);
      setLocalNumber(normalizedDefaultValue.slice(match.callingCode.length + 1).trim());
    }
  }, [defaultValue, dialOptions, status]);

  useEffect(() => {
    if (status !== "ready" || !countryCode) return;
    const match = dialOptions.find((option) => option.countryCode === countryCode);
    if (match) setCallingCodeSelection(match.key);
  }, [countryCode, dialOptions, status]);

  useEffect(() => {
    const selected = dialOptions.find((option) => option.key === callingCodeSelection);
    if (selected && localNumber.trim()) {
      setPhoneNumber(`+${selected.callingCode} ${localNumber.trim()}`);
    }
  }, [callingCodeSelection, dialOptions, localNumber]);

  const selectedDialOption = dialOptions.find((option) => option.key === callingCodeSelection);
  const maximumNumberDigits = Math.max(
    1,
    Math.min(selectedDialOption?.nationalNumberMaxLength ?? maxLength, maxLength),
  );

  useEffect(() => {
    const limitedNumber = limitPhoneNumberDigits(localNumber, maximumNumberDigits);
    if (limitedNumber === localNumber) return;
    setLocalNumber(limitedNumber);
  }, [localNumber, maximumNumberDigits]);

  function updatePhone(nextLocalNumber: string, nextSelection: string) {
    const option = dialOptions.find((item) => item.key === nextSelection);
    setPhoneNumber(
      nextLocalNumber.trim()
        ? `${option ? `+${option.callingCode} ` : ""}${nextLocalNumber.trim()}`
        : "",
    );
  }

  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={`${controlId}-number`}>
        {label}{required && <> <span className="gg-req">*</span></>}
      </label>
      <div className="geography-phone-control">
        <select
          className="gg-select"
          aria-label="Phone country calling code"
          value={callingCodeSelection}
          onChange={(event) => {
            const selection = event.target.value;
            setCallingCodeSelection(selection);
            const selected = dialOptions.find((option) => option.key === selection);
            const nextLocalNumber = limitPhoneNumberDigits(
              localNumber,
              Math.max(1, Math.min(selected?.nationalNumberMaxLength ?? maxLength, maxLength)),
            );
            setLocalNumber(nextLocalNumber);
            updatePhone(nextLocalNumber, selection);
            if (selected) onCountryCodeChange?.(selected.countryCode);
          }}
          disabled={disabled || status !== "ready"}
        >
          <option value="">{status === "ready" ? "Code" : "Loading..."}</option>
          {dialOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.flag ? `${option.flag} ` : ""}(+{option.callingCode})
            </option>
          ))}
        </select>
        <input
          className="gg-input"
          id={`${controlId}-number`}
          type="tel"
          value={localNumber}
          onChange={(event) => {
            const value = event.target.value;
            const internationalNumber = parseInternationalPhoneNumber(value);
            const internationalOptions = internationalNumber
              ? dialOptions.filter(
                  (option) => option.callingCode === internationalNumber.countryCallingCode,
                )
              : [];
            const internationalOption =
              internationalOptions.find(
                (option) => option.countryCode === internationalNumber?.country,
              )
              ?? internationalOptions.find((option) => option.key === callingCodeSelection)
              ?? internationalOptions[0];

            if (internationalNumber && internationalOption) {
              setCallingCodeSelection(internationalOption.key);
              setLocalNumber(internationalNumber.nationalNumber);
              updatePhone(internationalNumber.nationalNumber, internationalOption.key);
              if (internationalOption.countryCode !== selectedDialOption?.countryCode) {
                onCountryCodeChange?.(internationalOption.countryCode);
              }
              return;
            }

            const nextLocalNumber = /^\s*(?:\+|00)/.test(value)
              ? value.slice(0, maxLength)
              : limitPhoneNumberDigits(value, maximumNumberDigits);
            setLocalNumber(nextLocalNumber);
            updatePhone(nextLocalNumber, callingCodeSelection);
          }}
          autoComplete="tel-national"
          maxLength={maxLength}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${controlId}-error` : undefined}
          disabled={disabled}
        />
      </div>
      <input type="hidden" name="phoneNumber" value={phoneNumber} />
      {status === "error" && (
        <span className="gg-caption">Calling-code options are unavailable; you can still enter a phone number.</span>
      )}
      {error && <span className="profile-field-error" id={`${controlId}-error`}>{error}</span>}
    </div>
  );
}
