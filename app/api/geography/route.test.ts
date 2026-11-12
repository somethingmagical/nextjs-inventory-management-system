import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

async function withMockedFetch(
  data: unknown,
  run: (url: URL, response: Response) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return Response.json(data);
  };

  try {
    const requestUrl = new URL("http://localhost/api/geography?type=regions&country=US&countryName=United+States");
    const response = await GET(new Request(requestUrl));
    assert.ok(requestedUrl);
    await run(requestedUrl, response);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("region lookup returns normalized options for the selected country", async () => {
  await withMockedFetch(
    {
      error: false,
      data: {
        states: [
          { name: "Washington", state_code: "WA" },
          { name: "Oregon", state_code: "OR" },
        ],
      },
    },
    async (url, response) => {
      assert.equal(url.origin, "https://countriesnow.space");
      assert.equal(url.pathname, "/api/v0.1/countries/states/q");
      assert.equal(url.searchParams.get("country"), "United States");
      assert.deepEqual(await response.json(), [
        { name: "Washington", code: "WA" },
        { name: "Oregon", code: "OR" },
      ]);
    },
  );
});

test("city lookup uses the selected country and region", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return Response.json({ error: false, data: ["Seattle", "Tacoma"] });
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=cities&country=US&countryName=United+States&region=Washington",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.pathname, "/api/v0.1/countries/state/cities/q");
    assert.equal(requestedUrl.searchParams.get("country"), "United States");
    assert.equal(requestedUrl.searchParams.get("state"), "Washington");
    assert.deepEqual(await response.json(), [
      { name: "Seattle", countryCode: "US" },
      { name: "Tacoma", countryCode: "US" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("region lookup rejects invalid country codes before calling the provider", async () => {
  const response = await GET(new Request(
    "http://localhost/api/geography?type=regions&country=USA&countryName=United+States",
  ));

  assert.equal(response.status, 400);
});

test("country lookup includes national phone digit limits", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.COUNTRIES_API_BASE_URL;
  process.env.COUNTRIES_API_BASE_URL = "https://countries.example/api";
  globalThis.fetch = async () => Response.json([
    { name: "United States", alpha2Code: "US", callingCodes: ["1"], flag: "🇺🇸" },
    { name: "New Zealand", alpha2Code: "NZ", callingCodes: ["64"], flag: "🇳🇿" },
    { name: "India", alpha2Code: "IN", callingCodes: ["91"], flag: "🇮🇳" },
  ]);

  try {
    const response = await GET(new Request("http://localhost/api/geography?type=countries"));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        name: "United States",
        alpha2Code: "US",
        callingCodes: ["1"],
        flag: "🇺🇸",
        nationalNumberMaxLength: 11,
      },
      {
        name: "New Zealand",
        alpha2Code: "NZ",
        callingCodes: ["64"],
        flag: "🇳🇿",
        nationalNumberMaxLength: 11,
      },
      {
        name: "India",
        alpha2Code: "IN",
        callingCodes: ["91"],
        flag: "🇮🇳",
        nationalNumberMaxLength: 14,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.COUNTRIES_API_BASE_URL;
    else process.env.COUNTRIES_API_BASE_URL = originalBaseUrl;
  }
});

test("country lookup falls back to a built-in list when the remote API is unavailable", async () => {
  const originalBaseUrl = process.env.COUNTRIES_API_BASE_URL;
  delete process.env.COUNTRIES_API_BASE_URL;

  try {
    const response = await GET(new Request("http://localhost/api/geography?type=countries"));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.some((country) => country.alpha2Code === "US" && country.name === "United States"));
    assert.ok(data.some((country) => country.alpha2Code === "NZ"));
  } finally {
    if (originalBaseUrl === undefined) delete process.env.COUNTRIES_API_BASE_URL;
    else process.env.COUNTRIES_API_BASE_URL = originalBaseUrl;
  }
});

test("postal code lookup returns unique codes for the selected city and region", async () => {
  const originalFetch = globalThis.fetch;
  const originalUsername = process.env.GEONAMES_USERNAME;
  let requestedUrl: URL | undefined;
  process.env.GEONAMES_USERNAME = "test-user";
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return Response.json({
      postalCodes: [
        { postalCode: "98101", placeName: "Seattle", adminName1: "Washington" },
        { postalCode: "98101", placeName: "Seattle", adminName1: "Washington" },
        { postalCode: "98001", placeName: "Auburn", adminName1: "Washington" },
        { postalCode: "10001", placeName: "New York", adminName1: "New York" },
      ],
    });
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=US&city=Seattle&region=Washington",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.origin, "https://secure.geonames.org");
    assert.equal(requestedUrl.pathname, "/postalCodeSearchJSON");
    assert.equal(requestedUrl.searchParams.get("country"), "US");
    assert.equal(requestedUrl.searchParams.get("placename"), "Seattle");
    assert.equal(requestedUrl.searchParams.get("username"), "test-user");
    assert.deepEqual(await response.json(), [{ postalCode: "98101" }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUsername === undefined) delete process.env.GEONAMES_USERNAME;
    else process.env.GEONAMES_USERNAME = originalUsername;
  }
});

test("postal code lookup requires a GeoNames username configuration", async () => {
  const originalUsername = process.env.GEONAMES_USERNAME;
  delete process.env.GEONAMES_USERNAME;

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=US&city=Seattle&region=Washington",
    ));

    assert.equal(response.status, 503);
  } finally {
    if (originalUsername !== undefined) process.env.GEONAMES_USERNAME = originalUsername;
  }
});
