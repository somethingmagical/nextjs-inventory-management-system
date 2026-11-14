import { z } from "zod";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import { getMaxNationalPhoneInputLength } from "@/lib/phone-number-length";
import {
  getGeoNamesCountryRecords,
  getGeoNamesPostalPlaces,
  type GeoNamesPostalPlace,
  type GeoNamesRecord,
} from "@/lib/geography/geonames";

function getCountriesApiBaseUrl() {
  const configuredUrl = process.env.COUNTRIES_API_BASE_URL?.trim();
  return configuredUrl || undefined;
}

const countrySchema = z.object({
  name: z.string().min(1),
  alpha2Code: z.string().length(2),
  callingCodes: z.array(z.string()),
  flag: z.string().optional(),
});

const citySchema = z.object({
  name: z.string().min(1),
  countryCode: z.string().length(2),
  geonameId: z.number().int().optional(),
  featureCode: z.string().optional(),
  admin1Code: z.string().optional(),
  admin2Code: z.string().optional(),
  admin3Code: z.string().optional(),
});

const postalPlaceSchema = z.object({
  postalCode: z.string(),
  placeName: z.string().min(1),
  admin1: z.object({ name: z.string().nullable() }).nullable().optional(),
  admin2: z.object({ name: z.string().nullable() }).nullable().optional(),
});

const countryCodeSchema = z.string().regex(/^[A-Za-z]{2}$/);

function normalizeGeographyName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+(city|district|county|region|province|state|territory)$/i, "")
    .toLocaleLowerCase();
}

function uniqueGeographyNames(values: string[]) {
  const names = new Map<string, string>();
  for (const value of values) {
    const name = value.trim();
    const normalizedName = normalizeGeographyName(name);
    if (name && normalizedName && !names.has(normalizedName)) {
      names.set(normalizedName, name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function isPostalPlaceInCity(
  place: GeoNamesPostalPlace,
  city: string,
) {
  const normalizedCity = normalizeGeographyName(city);
  return [place.admin2, place.admin3]
    .some((adminName) => normalizeGeographyName(adminName) === normalizedCity);
}

function getFallbackCountryOptions() {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  return Object.entries((phoneMetadata as { countries?: Record<string, unknown> }).countries ?? {})
    .map(([alpha2Code, countryData]) => {
      const callingCodes = Array.isArray(countryData)
        ? countryData
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .slice(0, 1)
        : [];

      const name = displayNames.of(alpha2Code) ?? alpha2Code;
      return {
        name,
        alpha2Code,
        callingCodes,
        flag: [...alpha2Code].map((letter) =>
          String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65),
        ).join(""),
        nationalNumberMaxLength: getMaxNationalPhoneInputLength(alpha2Code),
        source: "local_metadata",
        sourceType: "local_dataset",
        isManual: false,
      };
    })
    .filter((country) => country.name && country.alpha2Code)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getAdminCode(record: GeoNamesRecord, level: number) {
  return [
    record.admin1Code,
    record.admin2Code,
    record.admin3Code,
    record.admin4Code,
  ][level - 1] ?? "";
}

function getAdminCodeParam(requestUrl: URL, level: number) {
  return requestUrl.searchParams.get(`admin${level}`)?.trim() ?? "";
}

function geoNamesSource<T extends object>(record: T) {
  return {
    ...record,
    source: "GeoNames",
    sourceType: "external_dataset",
    isManual: false,
  };
}

function countriesDevSource<T extends object>(record: T) {
  return {
    ...record,
    source: "Countries.dev",
    sourceType: "external_api",
    isManual: false,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type");
  const countryParam = requestUrl.searchParams.get("country");
  const countryCode = countryCodeSchema.safeParse(countryParam);
  const countryName = requestUrl.searchParams.get("countryName")?.trim() ?? "";
  const region = requestUrl.searchParams.get("region")?.trim() ?? "";

  if (type === "countries") {
    const countriesApiBaseUrl = getCountriesApiBaseUrl();
    if (!countriesApiBaseUrl) return Response.json(getFallbackCountryOptions());
    const endpoint = new URL("/countries", countriesApiBaseUrl);
    endpoint.searchParams.set("fields", "name,alpha2Code,callingCodes,flag");
    try {
      const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
      if (!response.ok) {
        console.error(`Countries.dev countries lookup failed with status ${response.status}.`);
        return Response.json(getFallbackCountryOptions());
      }

      const responseData: unknown = await response.json();
      const parsed = z.array(countrySchema).safeParse(responseData);
      if (!parsed.success) {
        console.error("Countries.dev countries lookup returned an unexpected response.");
        return Response.json(getFallbackCountryOptions());
      }

      const countries = new Map<string, z.infer<typeof countrySchema>>();
      for (const country of parsed.data) {
        const code = country.alpha2Code.toUpperCase();
        if (!countries.has(code)) countries.set(code, { ...country, alpha2Code: code });
      }
      return Response.json([...countries.values()].map((country) => ({
        ...country,
        nationalNumberMaxLength: getMaxNationalPhoneInputLength(country.alpha2Code),
        source: "Countries.dev",
        sourceType: "external_api",
        isManual: false,
      })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Countries.dev countries lookup could not be completed.", error);
      return Response.json(getFallbackCountryOptions());
    }
  }

  if (type === "regions") {
    if (!countryCode.success) return jsonError("A valid country is required.", 400);
    const level = Number(requestUrl.searchParams.get("level") ?? "1");
    if (!Number.isInteger(level) || level < 1 || level > 4) {
      return jsonError("A valid administrative level from 1 to 4 is required.", 400);
    }
    const parentCodes = Array.from({ length: level - 1 }, (_, index) =>
      getAdminCodeParam(requestUrl, index + 1),
    );
    if (parentCodes.some((code) => !code || code.length > 100)) {
      return jsonError("Choose each parent administrative area first.", 400);
    }

    try {
      const records = await getGeoNamesCountryRecords(countryCode.data.toUpperCase());
      const optionsByCode = new Map<string, GeoNamesRecord>();
      for (const record of records
        .filter((record) =>
          record.featureClass === "A"
          && record.featureCode === `ADM${level}`
          && parentCodes.every((code, index) => getAdminCode(record, index + 1) === code)
          && getAdminCode(record, level),
        )) {
        const key = normalizeGeographyName(record.name);
        if (record.name.trim() && !optionsByCode.has(key)) {
          optionsByCode.set(key, record);
        }
      }
      const options = [...optionsByCode.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((record) => geoNamesSource({
          id: record.geonameId,
          name: record.name.trim(),
          code: getAdminCode(record, level),
          level,
          admin1Code: record.admin1Code,
          admin2Code: record.admin2Code,
          admin3Code: record.admin3Code,
          admin4Code: record.admin4Code,
        }));
      return Response.json(options);
    } catch (error) {
      console.error(`GeoNames administrative level ${level} lookup could not be completed.`, error);
      return jsonError("Administrative area options are unavailable. You can enter the area manually.", 502);
    }
  }

  if (type === "cities") {
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    if (!countryCode.success || query.length > 100 || region.length > 100) {
      return jsonError("A valid country, region, and city search are required.", 400);
    }

    const hasAdministrativeParent = [1, 2, 3, 4]
      .some((level) => getAdminCodeParam(requestUrl, level));
    if (region || hasAdministrativeParent) {
      const country = countryCode.data.toUpperCase();
      try {
        const records = await getGeoNamesCountryRecords(country);
        const selectedCodes = [1, 2, 3, 4].map((level) => getAdminCodeParam(requestUrl, level));
        if (region && !selectedCodes[0]) {
          const matchingRegion = records.find((record) =>
            record.featureClass === "A"
            && record.featureCode === "ADM1"
            && normalizeGeographyName(record.name) === normalizeGeographyName(region),
          );
          if (!matchingRegion?.admin1Code) return Response.json([]);
          selectedCodes[0] = matchingRegion.admin1Code;
        }

        const cities = records
          .filter((record) =>
            record.featureClass === "P"
            && selectedCodes.every((code, index) => !code || getAdminCode(record, index + 1) === code)
            && (!query || normalizeGeographyName(record.name).includes(normalizeGeographyName(query))),
          )
          .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name))
          .slice(0, 100)
          .map((record) => geoNamesSource({
            name: record.name,
            countryCode: country,
            geonameId: Number(record.geonameId),
            featureCode: record.featureCode,
            admin1Code: record.admin1Code,
            admin2Code: record.admin2Code,
            admin3Code: record.admin3Code,
          }));
        return Response.json(cities);
      } catch (error) {
        console.error("GeoNames city lookup could not be completed.", error);
        return jsonError("City options are unavailable. You can enter a city manually.", 502);
      }
    }

    if (query.length < 2) {
      return jsonError("City search must be 2 to 100 characters.", 400);
    }
    const countriesApiBaseUrl = getCountriesApiBaseUrl();
    if (!countriesApiBaseUrl) {
      return jsonError("City suggestions are unavailable. You can enter a city manually.", 503);
    }
    const endpoint = new URL("/cities", countriesApiBaseUrl);
    endpoint.searchParams.set("country", countryCode.data.toUpperCase());
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("limit", "10");
    try {
      const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
      if (!response.ok) {
        console.error(`Countries.dev cities lookup failed with status ${response.status}.`);
        return jsonError("City suggestions are unavailable. You can enter a city manually.", 502);
      }

      const data: unknown = await response.json();
      const parsed = z.array(citySchema).safeParse(data);
      if (!parsed.success) {
        console.error("Countries.dev cities lookup returned an unexpected response.");
        return jsonError("City suggestions returned invalid data.", 502);
      }
      return Response.json(parsed.data.map((city) => countriesDevSource(city)));
    } catch (error) {
      console.error("Countries.dev cities lookup could not be completed.", error);
      return jsonError("City suggestions are unavailable. You can enter a city manually.", 502);
    }
  }

  if (type === "postal") {
    const code = requestUrl.searchParams.get("code")?.trim() ?? "";
    if (!countryCode.success || code.length < 1 || code.length > 20) {
      return jsonError("A valid country and postal code are required.", 400);
    }

    const countriesApiBaseUrl = getCountriesApiBaseUrl();
    if (!countriesApiBaseUrl) {
      return jsonError("Postal-code location lookup is unavailable.", 503);
    }
    const endpoint = new URL(
      `postal/${countryCode.data.toUpperCase()}/${encodeURIComponent(code)}`,
      `${countriesApiBaseUrl}/`,
    );
    try {
      const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
      if (!response.ok) {
        console.error(`Countries.dev postal lookup failed with status ${response.status}.`);
        return jsonError("Postal-code location lookup is unavailable.", 502);
      }

      const data: unknown = await response.json();
      const parsed = z.array(postalPlaceSchema).safeParse(data);
      if (!parsed.success) {
        console.error("Countries.dev postal lookup returned an unexpected response.");
        return jsonError("Postal-code location lookup returned invalid data.", 502);
      }
      return Response.json(parsed.data.map((place) => countriesDevSource(place)));
    } catch (error) {
      console.error("Countries.dev postal lookup could not be completed.", error);
      return jsonError("Postal-code location lookup is unavailable.", 502);
    }
  }

  if (type === "suburbs" || type === "postal-codes") {
    const city = requestUrl.searchParams.get("city")?.trim() ?? "";
    const suburb = requestUrl.searchParams.get("suburb")?.trim() ?? "";
    const adminCodes = [1, 2, 3, 4].map((level) => getAdminCodeParam(requestUrl, level));
    if (
      !countryCode.success
      || city.length < 1
      || city.length > 100
      || region.length > 100
      || suburb.length > 100
    ) {
      return jsonError("A valid country and city are required.", 400);
    }

    try {
      const requestedCountryCode = countryCode.data.toUpperCase();
      const postalPlaces = await getGeoNamesPostalPlaces(requestedCountryCode);
      const normalizedRegion = normalizeGeographyName(region);
      const regionPlaces = postalPlaces.filter((place) =>
        (!region || normalizeGeographyName(place.admin1) === normalizedRegion)
        && adminCodes.every((code, index) => !code || [
          place.admin1Code,
          place.admin2Code,
          place.admin3Code,
          "",
        ][index] === code),
      );

      if (type === "suburbs") {
        const normalizedCity = normalizeGeographyName(city);
        const suburbs = uniqueGeographyNames(regionPlaces
          .filter((place) =>
            isPostalPlaceInCity(place, city),
          )
          .map((place) => place.placeName)
          .filter((name) => normalizeGeographyName(name) !== normalizedCity));
        return Response.json(suburbs.map((name) => geoNamesSource({ name, type: "suburb" })));
      }

      const normalizedPlaceName = normalizeGeographyName(suburb || city);
      const postalCodes = [...new Set(regionPlaces
        .filter((place) =>
          normalizeGeographyName(place.placeName) === normalizedPlaceName
          && (!suburb || isPostalPlaceInCity(place, city)),
        )
        .map((place) => place.postalCode))];
      return Response.json(postalCodes
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((postalCode) => geoNamesSource({ postalCode, type: "postal_code" })));
    } catch (error) {
      console.error(`GeoNames ${type} lookup could not be completed.`, error);
      return jsonError("The geography lookup is temporarily unavailable.", 502);
    }
  }

  if (type === "streets") {
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    if (!countryCode.success || query.length < 2 || query.length > 100) {
      return jsonError("A valid country and street search of 2 to 100 characters are required.", 400);
    }
    const localNominatimUrl = process.env.OSM_NOMINATIM_BASE_URL?.trim();
    if (!localNominatimUrl) {
      return jsonError("Local OpenStreetMap street data is not configured. Enter the street manually.", 503);
    }

    try {
      const base = new URL(localNominatimUrl);
      if (base.hostname === "openstreetmap.org" || base.hostname.endsWith(".openstreetmap.org")) {
        return jsonError("Public OpenStreetMap search servers are not supported. Configure a self-hosted instance.", 503);
      }
      const endpoint = new URL("search", `${base.toString().replace(/\/+$/, "")}/`);
      endpoint.searchParams.set("street", query);
      endpoint.searchParams.set("country", countryName);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("addressdetails", "1");
      endpoint.searchParams.set("limit", "10");
      const city = requestUrl.searchParams.get("city")?.trim();
      const suburb = requestUrl.searchParams.get("suburb")?.trim();
      if (city) endpoint.searchParams.set("city", city);
      if (suburb) endpoint.searchParams.set("suburb", suburb);
      if (region) endpoint.searchParams.set("state", region);

      const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
      if (!response.ok) {
        console.error(`Self-hosted Nominatim street lookup failed with status ${response.status}.`);
        return jsonError("Street suggestions are unavailable. Enter the street manually.", 502);
      }
      const data: unknown = await response.json();
      const resultSchema = z.array(z.object({
        osm_id: z.union([z.string(), z.number()]).optional(),
        osm_type: z.string().optional(),
        name: z.string().optional(),
        display_name: z.string(),
        address: z.record(z.string(), z.unknown()).optional(),
      }));
      const parsed = resultSchema.safeParse(data);
      if (!parsed.success) {
        console.error("Self-hosted Nominatim street lookup returned an unexpected response.");
        return jsonError("Street suggestions returned invalid data. Enter the street manually.", 502);
      }

      const streets = new Map<string, { name: string; externalId: string }>();
      for (const result of parsed.data) {
        const roadName = typeof result.address?.road === "string"
          ? result.address.road.trim()
          : result.name?.trim() ?? "";
        if (!roadName) continue;
        const key = normalizeGeographyName(roadName);
        if (!streets.has(key)) {
          streets.set(key, {
            name: roadName,
            externalId: result.osm_id === undefined
              ? ""
              : `${result.osm_type ?? "way"}/${result.osm_id}`,
          });
        }
      }
      return Response.json([...streets.values()].map((street) => ({
        ...street,
        type: "street",
        source: "OpenStreetMap",
        sourceType: "local_dataset",
        isManual: false,
      })));
    } catch (error) {
      console.error("Self-hosted Nominatim street lookup could not be completed.", error);
      return jsonError("Street suggestions are unavailable. Enter the street manually.", 502);
    }
  }

  return jsonError("Unsupported geography lookup.", 400);
}
