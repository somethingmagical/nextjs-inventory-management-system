import { z } from "zod";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import { getMaxNationalPhoneInputLength } from "@/lib/phone-number-length";

const countrySchema = z.object({
  name: z.string().min(1),
  alpha2Code: z.string().length(2),
  callingCodes: z.array(z.string()),
  flag: z.string().optional(),
});

const citySchema = z.object({
  name: z.string().min(1),
  countryCode: z.string().length(2),
});

const regionSchema = z.object({
  name: z.string().min(1),
  state_code: z.string().nullable().optional(),
});

const regionsResponseSchema = z.object({
  error: z.boolean(),
  data: z.object({
    states: z.array(regionSchema),
  }),
});

const regionCitiesResponseSchema = z.object({
  error: z.boolean(),
  data: z.array(z.string().min(1)),
});

const postalPlaceSchema = z.object({
  postalCode: z.string(),
  placeName: z.string().min(1),
  admin1: z.object({ name: z.string().nullable() }).nullable().optional(),
});

const postalCodesResponseSchema = z.object({
  postalCodes: z.array(z.object({
    postalCode: z.string().min(1),
    placeName: z.string().min(1),
    adminName1: z.string().nullable().optional(),
  })),
});

const countryCodeSchema = z.string().regex(/^[A-Za-z]{2}$/);

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
        nationalNumberMaxLength: getMaxNationalPhoneInputLength(alpha2Code),
      };
    })
    .filter((country) => country.name && country.alpha2Code)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const baseUrl = process.env.COUNTRIES_API_BASE_URL?.trim();

  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type");
  const countryParam = requestUrl.searchParams.get("country");
  const countryCode = countryCodeSchema.safeParse(countryParam);
  const countryName = requestUrl.searchParams.get("countryName")?.trim() ?? "";
  const region = requestUrl.searchParams.get("region")?.trim() ?? "";

  let endpoint: URL;
  let responseSchema: z.ZodType;

  if (type === "countries") {
    if (!baseUrl) {
      return Response.json(getFallbackCountryOptions());
    }
    endpoint = new URL("countries", `${baseUrl.replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("fields", "name,alpha2Code,callingCodes,flag");
    responseSchema = z.array(countrySchema);
  } else if (type === "cities") {
    if (region) {
      if (!countryCode.success || countryName.length < 1 || countryName.length > 100 || region.length > 100) {
        return jsonError("A valid country and region are required.", 400);
      }

      endpoint = new URL("countries/state/cities/q", "https://countriesnow.space/api/v0.1/");
      endpoint.searchParams.set("country", countryName);
      endpoint.searchParams.set("state", region);
      responseSchema = regionCitiesResponseSchema;
    } else {
      if (!baseUrl) return jsonError("Countries.dev API is not configured.", 503);
      const query = requestUrl.searchParams.get("q")?.trim() ?? "";
      if (!countryCode.success || query.length < 2 || query.length > 100) {
        return jsonError("A valid country and city search of 2 to 100 characters are required.", 400);
      }

      endpoint = new URL("cities", `${baseUrl.replace(/\/+$/, "")}/`);
      endpoint.searchParams.set("country", countryCode.data.toUpperCase());
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("limit", "10");
      responseSchema = z.array(citySchema);
    }
  } else if (type === "regions") {
    if (!countryCode.success || countryName.length < 1 || countryName.length > 100) {
      return jsonError("A valid country is required.", 400);
    }

    endpoint = new URL("countries/states/q", "https://countriesnow.space/api/v0.1/");
    endpoint.searchParams.set("country", countryName);
    responseSchema = regionsResponseSchema;
  } else if (type === "postal") {
    if (!baseUrl) return jsonError("Countries.dev API is not configured.", 503);
    const code = requestUrl.searchParams.get("code")?.trim() ?? "";
    if (!countryCode.success || code.length < 1 || code.length > 20) {
      return jsonError("A valid country and postal code are required.", 400);
    }

    endpoint = new URL(
      `postal/${countryCode.data.toUpperCase()}/${encodeURIComponent(code)}`,
      `${baseUrl.replace(/\/+$/, "")}/`,
    );
    responseSchema = z.array(postalPlaceSchema);
  } else if (type === "postal-codes") {
    const username = process.env.GEONAMES_USERNAME?.trim();
    const city = requestUrl.searchParams.get("city")?.trim() ?? "";
    if (!username) return jsonError("City postal code lookup is not configured.", 503);
    if (
      !countryCode.success
      || city.length < 1
      || city.length > 100
      || region.length > 100
    ) {
      return jsonError("A valid country and city are required.", 400);
    }

    endpoint = new URL("postalCodeSearchJSON", "https://secure.geonames.org/");
    endpoint.searchParams.set("country", countryCode.data.toUpperCase());
    endpoint.searchParams.set("placename", city);
    endpoint.searchParams.set("maxRows", "100");
    endpoint.searchParams.set("username", username);
    responseSchema = postalCodesResponseSchema;
  } else {
    return jsonError("Unsupported geography lookup.", 400);
  }

  const lookupProvider = type === "regions" || (type === "cities" && region)
    ? "CountriesNow"
    : type === "postal-codes"
      ? "GeoNames"
      : "Countries.dev";

  try {
    const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
    if (!response.ok) {
      if (type === "countries") {
        return Response.json(getFallbackCountryOptions());
      }
      console.error(`${lookupProvider} ${type} lookup failed with status ${response.status}.`);
      return jsonError("The geography lookup failed. Please try again.", 502);
    }

    const responseData: unknown = await response.json();
    const parsed = responseSchema.safeParse(responseData);
    if (!parsed.success) {
      console.error(`${lookupProvider} ${type} lookup returned an unexpected response.`);
      return jsonError("The geography lookup returned invalid data.", 502);
    }

    if (type === "regions") {
      const regionData = regionsResponseSchema.parse(parsed.data);
      if (regionData.error) return jsonError("Region options are unavailable for this country.", 502);
      return Response.json(regionData.data.states.map(({ name, state_code }) => ({ name, code: state_code ?? "" })));
    }
    if (type === "cities" && region) {
      const cityData = regionCitiesResponseSchema.parse(parsed.data);
      if (cityData.error) return jsonError("City options are unavailable for this region.", 502);
      if (!countryCode.success) return jsonError("A valid country is required.", 400);
      return Response.json([...new Set(cityData.data)].map((name) => ({
        name,
        countryCode: countryCode.data.toUpperCase(),
      })));
    }
    if (type === "postal-codes") {
      const postalCodesData = postalCodesResponseSchema.parse(parsed.data);
      const city = requestUrl.searchParams.get("city")?.trim() ?? "";
      const matchingPlaces = postalCodesData.postalCodes.filter((place) =>
        place.placeName.toLocaleLowerCase() === city.toLocaleLowerCase()
        && (!region || place.adminName1?.toLocaleLowerCase() === region.toLocaleLowerCase()),
      );
      const postalCodes = [...new Set(matchingPlaces.map((place) => place.postalCode.trim()).filter(Boolean))];
      return Response.json(postalCodes.map((postalCode) => ({ postalCode })));
    }

    if (type === "countries") {
      return Response.json(countrySchema.array().parse(parsed.data).map((country) => ({
        ...country,
        nationalNumberMaxLength: getMaxNationalPhoneInputLength(country.alpha2Code),
      })));
    }

    return Response.json(parsed.data);
  } catch (error) {
    console.error(`${lookupProvider} ${type} lookup could not be completed.`, error);
    return jsonError("The geography lookup is temporarily unavailable.", 502);
  }
}
