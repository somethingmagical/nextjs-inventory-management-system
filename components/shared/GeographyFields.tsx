"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type CountryOption = {
  name: string;
  alpha2Code: string;
  callingCodes: string[];
  nationalNumberMaxLength?: number;
  flag?: string;
};

type PostalCodeOption = {
  postalCode: string;
};

type RegionOption = {
  name: string;
  code: string;
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

function isCityOption(value: unknown): value is { name: string; countryCode: string } {
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
        return data.sort((a, b) => a.name.localeCompare(b.name));
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
  countryError,
  cityError,
  regionError,
  postalError,
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
  countryError?: string;
  cityError?: string;
  regionError?: string;
  postalError?: string;
  disabled?: boolean;
  showRegion?: boolean;
  showPostalCode?: boolean;
  onCountryCodeChange?: (countryCode: string) => void;
  phoneCountrySelection?: { countryCode: string; version: number } | null;
}) {
  const { countries, status } = useCountryOptions();
  const id = useId();
  const processedPhoneCountryVersion = useRef(0);
  const [country, setCountry] = useState(initialCountry);
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState(initialCity);
  const [region, setRegion] = useState(initialRegion);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [regionLookupError, setRegionLookupError] = useState(false);
  const [regionLookupPending, setRegionLookupPending] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [cityLookupError, setCityLookupError] = useState(false);
  const [cityLookupPending, setCityLookupPending] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [activeCityIndex, setActiveCityIndex] = useState(-1);
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? "");
  const [postalCodeOptions, setPostalCodeOptions] = useState<string[]>([]);
  const [postalLookupError, setPostalLookupError] = useState(false);
  const [postalLookupMessage, setPostalLookupMessage] = useState("");
  const cityQuery = showRegion ? "" : city.trim();

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
    setCity("");
    setRegion("");
    setCityOptions([]);
    setCityMenuOpen(false);
    setPostalCode("");
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
        return data.sort((a, b) => a.name.localeCompare(b.name));
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
    const cityLookupIsReady = showRegion
      ? Boolean(countryCode && country && region)
      : Boolean(countryCode && cityQuery.length >= 2);
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
        });
        if (showRegion && region) {
          params.set("countryName", country);
          params.set("region", region);
        } else {
          params.set("q", cityQuery);
        }
        const response = await fetch(`/api/geography?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City suggestions are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCityOption)) {
          throw new Error("City suggestions returned an invalid response.");
        }
        setCityOptions([...new Set(data.map((item) => item.name))]);
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
  }, [cityQuery, country, countryCode, region, showRegion]);

  useEffect(() => {
    if (!showPostalCode || !countryCode || !city) {
      setPostalCodeOptions([]);
      setPostalLookupError(false);
      setPostalLookupMessage("");
      return;
    }

    const controller = new AbortController();
    setPostalCodeOptions([]);
    setPostalLookupError(false);
    setPostalLookupMessage("");

    async function loadPostalCodes() {
      try {
        const params = new URLSearchParams({
          type: "postal-codes",
          country: countryCode,
          city,
          region,
        });
        const response = await fetch(`/api/geography?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Postal code options are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isPostalCodeOption)) {
          throw new Error("Postal code lookup returned an invalid response.");
        }
        const options = [...new Set(data.map((item) => item.postalCode.trim()).filter(Boolean))];
        setPostalCodeOptions(options);
        if (options.length === 0) {
          setPostalLookupMessage("No postal codes found for this city. Enter the code manually.");
        }
      } catch {
        if (!controller.signal.aborted) {
          setPostalLookupError(true);
          setPostalLookupMessage("Postal code options are unavailable. Enter the code manually.");
        }
      }
    }

    void loadPostalCodes();
    return () => controller.abort();
  }, [city, countryCode, region, showPostalCode]);

  function chooseCity(value: string) {
    setCity(value);
    setCityMenuOpen(false);
    setActiveCityIndex(-1);
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

  const currentCountryIsListed = countries.some((option) => option.name === country);
  const cityInputDisabled = disabled || (!country && status !== "error");
  const cityListboxId = `${id}-city-options`;
  const currentRegionIsListed = regions.some((option) => option.name === region);

  return (
    <>
      <div className="gg-field">
        <label className="gg-label" htmlFor={`${id}-country`}>
          Country <span className="gg-req">*</span>
        </label>
        {status === "error" ? (
          <input
            className="gg-input"
            id={`${id}-country`}
            name="country"
            type="text"
            autoComplete="country-name"
            maxLength={100}
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setCountryCode("");
              setCity("");
              setRegion("");
              setPostalCode("");
              setCityOptions([]);
              setCityMenuOpen(false);
            }}
            required
            aria-invalid={Boolean(countryError)}
            aria-describedby={countryError ? `${id}-country-error` : `${id}-country-hint`}
            disabled={disabled}
          />
        ) : (
          <select
            className="gg-select"
            id={`${id}-country`}
            name="country"
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setCity("");
              setRegion("");
              setPostalCode("");
              setCityOptions([]);
              setCityMenuOpen(false);
            }}
            required
            aria-invalid={Boolean(countryError)}
            aria-describedby={countryError ? `${id}-country-error` : undefined}
            disabled={disabled || status !== "ready"}
          >
            <option value="" disabled>{status === "ready" ? "Select a country" : "Loading countries..."}</option>
            {country && !currentCountryIsListed && <option value={country}>{country} (saved value)</option>}
            {countries.map((option) => (
              <option key={option.alpha2Code} value={option.name}>
                {option.flag ? `${option.flag} ` : ""}{option.name}
              </option>
            ))}
          </select>
        )}
        {status === "error" && (
          <span className="gg-caption" id={`${id}-country-hint`}>
            Country options are unavailable; enter the country manually.
          </span>
        )}
        {countryError && <span className="warehouse-field-error" id={`${id}-country-error`}>{countryError}</span>}
      </div>

      {showRegion && (
        <div className="gg-field">
          <label className="gg-label" htmlFor={`${id}-region`}>Region</label>
          <select
            className="gg-select"
            id={`${id}-region`}
            name="region"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setCity("");
              setPostalCode("");
              setCityOptions([]);
              setCityMenuOpen(false);
            }}
            required
            aria-invalid={Boolean(regionError)}
            aria-describedby={regionError ? `${id}-region-error` : regionLookupError ? `${id}-region-hint` : undefined}
            disabled={disabled || !countryCode || regionLookupPending}
          >
            <option value="">
              {!countryCode
                ? "Select a country first"
                : regionLookupPending
                  ? "Loading regions..."
                  : regions.length > 0
                    ? "Select a region"
                    : "No regions available"}
            </option>
            {region && !currentRegionIsListed && <option value={region}>{region} (saved value)</option>}
            {regions.map((option) => (
              <option key={`${option.name}-${option.code}`} value={option.name}>{option.name}</option>
            ))}
          </select>
          {regionLookupError && (
            <span className="gg-caption" id={`${id}-region-hint`} role="status">
              Region options are unavailable, so a city cannot be selected.
            </span>
          )}
          {regionError && <span className="warehouse-field-error" id={`${id}-region-error`}>{regionError}</span>}
        </div>
      )}

      <div className="gg-field">
        <label className="gg-label" htmlFor={`${id}-city`}>
          City <span className="gg-req">*</span>
        </label>
        {showRegion ? (
          <select
            className="gg-select"
            id={`${id}-city`}
            name="city"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setPostalCode("");
            }}
            required
            aria-invalid={Boolean(cityError)}
            aria-describedby={cityError ? `${id}-city-error` : cityLookupError ? `${id}-city-hint` : undefined}
            disabled={cityInputDisabled || !region || cityLookupPending || cityLookupError}
          >
            <option value="">
              {!region
                ? "Select a region first"
                : cityLookupPending
                  ? "Loading cities..."
                  : cityLookupError
                    ? "City options unavailable"
                    : "Select a city"}
            </option>
            {city && !cityOptions.includes(city) && <option value={city}>{city} (saved value)</option>}
            {cityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
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
                setCity(event.target.value);
                setPostalCode("");
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
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={activeCityIndex === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseCity(option)}
                    >
                      {option}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {cityLookupError && (
          <span className="gg-caption" id={`${id}-city-hint`}>
            {showRegion
              ? "City options are unavailable for this region. Try selecting another region."
              : "City suggestions are unavailable; enter the city manually."}
          </span>
        )}
        {cityError && <span className="warehouse-field-error" id={`${id}-city-error`}>{cityError}</span>}
      </div>

      {showPostalCode && (
        <div className="gg-field">
          <label className="gg-label" htmlFor={`${id}-postal`}>
            Postal Code <span className="gg-req">*</span>
          </label>
          {city && postalCodeOptions.length > 0 && !postalLookupError ? (
            <select
              className="gg-select"
              id={`${id}-postal`}
              name="zipCode"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              required
              aria-invalid={Boolean(postalError)}
              aria-describedby={postalError ? `${id}-postal-error` : undefined}
              disabled={disabled}
            >
              <option value="" disabled>Select a postal code</option>
              {postalCode && !postalCodeOptions.includes(postalCode) && (
                <option value={postalCode}>{postalCode} (saved value)</option>
              )}
              {postalCodeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : city && postalLookupMessage ? (
            <input
              className="gg-input"
              id={`${id}-postal`}
              name="zipCode"
              type="text"
              autoComplete="postal-code"
              maxLength={20}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              required
              aria-invalid={Boolean(postalError)}
              aria-describedby={postalError ? `${id}-postal-error` : `${id}-postal-hint`}
              disabled={disabled}
            />
          ) : (
            <select
              className="gg-select"
              id={`${id}-postal`}
              name="zipCode"
              value=""
              required
              aria-invalid={Boolean(postalError)}
              aria-describedby={postalError ? `${id}-postal-error` : undefined}
              disabled
            >
              <option value="">
                {!city ? "Select a city first" : "Loading postal codes..."}
              </option>
            </select>
          )}
          {postalLookupMessage && (
            <span className="gg-caption" id={`${id}-postal-hint`} role="status">{postalLookupMessage}</span>
          )}
          {postalError && <span className="warehouse-field-error" id={`${id}-postal-error`}>{postalError}</span>}
        </div>
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
  );

  useEffect(() => {
    if (status !== "ready" || initialized.current) return;
    initialized.current = true;
    const match = [...dialOptions]
      .sort((a, b) => b.callingCode.length - a.callingCode.length)
      .find((option) => defaultValue.startsWith(`+${option.callingCode}`));

    if (match) {
      setCallingCodeSelection(match.key);
      setLocalNumber(defaultValue.slice(match.callingCode.length + 1).trim());
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
            const nextLocalNumber = limitPhoneNumberDigits(event.target.value, maximumNumberDigits);
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
