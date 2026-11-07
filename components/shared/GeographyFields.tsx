"use client";

import { useEffect, useId, useRef, useState } from "react";

type CountryOption = {
  name: string;
  alpha2Code: string;
  callingCodes: string[];
  flag?: string;
};

type PostalPlace = {
  postalCode: string;
  placeName: string;
  admin1?: { name: string | null } | null;
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

function isPostalPlace(value: unknown): value is PostalPlace {
  if (
    typeof value !== "object"
    || value === null
    || !("postalCode" in value)
    || typeof value.postalCode !== "string"
    || !("placeName" in value)
    || typeof value.placeName !== "string"
  ) {
    return false;
  }

  if (!("admin1" in value) || value.admin1 == null) return true;
  return typeof value.admin1 === "object"
    && "name" in value.admin1
    && (typeof value.admin1.name === "string" || value.admin1.name === null);
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
  initialPostalCode,
  countryError,
  cityError,
  postalError,
  disabled = false,
  showPostalCode = false,
  onCountryCodeChange,
  phoneCountrySelection,
}: {
  initialCountry?: string;
  initialCity?: string;
  initialPostalCode?: string;
  countryError?: string;
  cityError?: string;
  postalError?: string;
  disabled?: boolean;
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
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [cityLookupError, setCityLookupError] = useState(false);
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? "");
  const [postalPlaces, setPostalPlaces] = useState<PostalPlace[]>([]);
  const [postalLookupMessage, setPostalLookupMessage] = useState("");
  const [postalLookupPending, setPostalLookupPending] = useState(false);

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
    setCityOptions([]);
    setPostalPlaces([]);
    setPostalLookupMessage("");
  }, [countries, phoneCountrySelection, status]);

  useEffect(() => {
    const query = city.trim();
    if (!countryCode || query.length < 2) {
      setCityOptions([]);
      setCityLookupError(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          type: "cities",
          country: countryCode,
          q: query,
        });
        const response = await fetch(`/api/geography?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City suggestions are unavailable.");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCityOption)) {
          throw new Error("City suggestions returned an invalid response.");
        }
        setCityOptions([...new Set(data.map((item) => item.name))]);
        setCityLookupError(false);
      } catch {
        if (!controller.signal.aborted) {
          setCityOptions([]);
          setCityLookupError(true);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [city, countryCode]);

  async function lookupPostalCode() {
    if (!countryCode || !postalCode.trim()) {
      setPostalLookupMessage("Select a country and enter a postal code first.");
      return;
    }

    setPostalLookupPending(true);
    setPostalLookupMessage("");
    setPostalPlaces([]);

    try {
      const params = new URLSearchParams({
        type: "postal",
        country: countryCode,
        code: postalCode.trim(),
      });
      const response = await fetch(`/api/geography?${params}`);
      if (!response.ok) throw new Error("Postal lookup failed.");
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isPostalPlace)) {
        throw new Error("Postal lookup returned an invalid response.");
      }
      if (data.length === 0) {
        setPostalLookupMessage("No matching location was found. You can enter the city manually.");
      } else {
        setPostalPlaces(data);
        setPostalLookupMessage("Choose a matching location to fill the city.");
      }
    } catch {
      setPostalLookupMessage("Postal lookup is unavailable. You can enter the city manually.");
    } finally {
      setPostalLookupPending(false);
    }
  }

  function choosePostalPlace(value: string) {
    const place = postalPlaces.find((option, index) => `${option.postalCode}-${option.placeName}-${index}` === value);
    if (place) setCity(place.placeName);
  }

  const currentCountryIsListed = countries.some((option) => option.name === country);

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
              setCityOptions([]);
              setPostalPlaces([]);
              setPostalLookupMessage("");
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

      <div className="gg-field">
        <label className="gg-label" htmlFor={`${id}-city`}>
          City <span className="gg-req">*</span>
        </label>
        <input
          className="gg-input"
          id={`${id}-city`}
          name="city"
          type="text"
          list={`${id}-city-options`}
          placeholder={countryCode ? "Search or enter a city" : "Select a country first"}
          autoComplete="address-level2"
          maxLength={100}
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          aria-invalid={Boolean(cityError)}
          aria-describedby={
            cityError
              ? `${id}-city-error`
              : cityLookupError
                ? `${id}-city-hint`
                : undefined
          }
          disabled={disabled}
        />
        <datalist id={`${id}-city-options`}>
          {cityOptions.map((option) => <option key={option} value={option} />)}
        </datalist>
        {cityLookupError && (
          <span className="gg-caption" id={`${id}-city-hint`}>
            City suggestions are unavailable; enter the city manually.
          </span>
        )}
        {cityError && <span className="warehouse-field-error" id={`${id}-city-error`}>{cityError}</span>}
      </div>

      {showPostalCode && (
        <div className="gg-field">
          <label className="gg-label" htmlFor={`${id}-postal`}>
            Postal Code <span className="gg-req">*</span>
          </label>
          <div className="geography-postal-control">
            <input
              className="gg-input"
              id={`${id}-postal`}
              name="zipCode"
              type="text"
              autoComplete="postal-code"
              maxLength={20}
              value={postalCode}
              onChange={(event) => {
                setPostalCode(event.target.value);
                setPostalPlaces([]);
                setPostalLookupMessage("");
              }}
              required
              aria-invalid={Boolean(postalError)}
              aria-describedby={
                postalError
                  ? `${id}-postal-error`
                  : postalLookupMessage
                    ? `${id}-postal-hint`
                    : undefined
              }
              disabled={disabled}
            />
            <button
              className="gg-btn gg-btn--secondary"
              type="button"
              onClick={lookupPostalCode}
              disabled={disabled || postalLookupPending}
            >
              {postalLookupPending ? "Looking up..." : "Look up"}
            </button>
          </div>
          {postalLookupMessage && (
            <span className="gg-caption" id={`${id}-postal-hint`} role="status">{postalLookupMessage}</span>
          )}
          {postalPlaces.length > 0 && (
            <select
              className="gg-select"
              aria-label="Locations found for this postal code"
              defaultValue=""
              onChange={(event) => choosePostalPlace(event.target.value)}
            >
              <option value="" disabled>Select a matching city</option>
              {postalPlaces.map((place, index) => {
                const value = `${place.postalCode}-${place.placeName}-${index}`;
                const region = place.admin1?.name;
                return (
                  <option key={value} value={value}>
                    {place.placeName}{region ? `, ${region}` : ""}
                  </option>
                );
              })}
            </select>
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
        country: country.name,
        flag: country.flag,
        callingCode,
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
            updatePhone(localNumber, selection);
            const selected = dialOptions.find((option) => option.key === selection);
            if (selected) onCountryCodeChange?.(selected.countryCode);
          }}
          disabled={disabled || status !== "ready"}
        >
          <option value="">{status === "ready" ? "Code" : "Loading..."}</option>
          {dialOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.flag ? `${option.flag} ` : ""}{option.country} (+{option.callingCode})
            </option>
          ))}
        </select>
        <input
          className="gg-input"
          id={`${controlId}-number`}
          type="tel"
          value={localNumber}
          onChange={(event) => {
            setLocalNumber(event.target.value);
            updatePhone(event.target.value, callingCodeSelection);
          }}
          autoComplete="tel-national"
          maxLength={Math.max(1, maxLength - (selectedDialOption ? selectedDialOption.callingCode.length + 2 : 0))}
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
