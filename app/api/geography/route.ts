import { z } from "zod";

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

const postalPlaceSchema = z.object({
  postalCode: z.string(),
  placeName: z.string().min(1),
  admin1: z.object({ name: z.string().nullable() }).nullable().optional(),
});

const countryCodeSchema = z.string().regex(/^[A-Za-z]{2}$/);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const baseUrl = process.env.COUNTRIES_API_BASE_URL?.trim();
  if (!baseUrl) {
    return jsonError("Countries.dev API is not configured.", 503);
  }

  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type");
  const countryParam = requestUrl.searchParams.get("country");
  const countryCode = countryCodeSchema.safeParse(countryParam);

  let endpoint: URL;
  let responseSchema: z.ZodType;

  if (type === "countries") {
    endpoint = new URL("countries", `${baseUrl.replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("fields", "name,alpha2Code,callingCodes,flag");
    responseSchema = z.array(countrySchema);
  } else if (type === "cities") {
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    if (!countryCode.success || query.length < 2 || query.length > 100) {
      return jsonError("A valid country and city search of 2 to 100 characters are required.", 400);
    }

    endpoint = new URL("cities", `${baseUrl.replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("country", countryCode.data.toUpperCase());
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("limit", "10");
    responseSchema = z.array(citySchema);
  } else if (type === "postal") {
    const code = requestUrl.searchParams.get("code")?.trim() ?? "";
    if (!countryCode.success || code.length < 1 || code.length > 20) {
      return jsonError("A valid country and postal code are required.", 400);
    }

    endpoint = new URL(
      `postal/${countryCode.data.toUpperCase()}/${encodeURIComponent(code)}`,
      `${baseUrl.replace(/\/+$/, "")}/`,
    );
    responseSchema = z.array(postalPlaceSchema);
  } else {
    return jsonError("Unsupported geography lookup.", 400);
  }

  try {
    const response = await fetch(endpoint, { next: { revalidate: 86_400 } });
    if (!response.ok) {
      console.error(`Countries.dev ${type} lookup failed with status ${response.status}.`);
      return jsonError("The Countries.dev lookup failed. Please try again.", 502);
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(`Countries.dev ${type} lookup returned an unexpected response.`);
      return jsonError("The Countries.dev lookup returned invalid data.", 502);
    }

    return Response.json(parsed.data);
  } catch (error) {
    console.error(`Countries.dev ${type} lookup could not be completed.`, error);
    return jsonError("The Countries.dev lookup is temporarily unavailable.", 502);
  }
}
