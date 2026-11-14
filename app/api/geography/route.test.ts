import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { strToU8, zipSync } from "fflate";
import { GET } from "./route";

let originalGeographyDataDirectory: string | undefined;
let testGeographyDataDirectory: string | undefined;
let originalCountriesApiBaseUrl: string | undefined;
let originalOsmNominatimBaseUrl: string | undefined;

beforeEach(async () => {
  originalGeographyDataDirectory = process.env.GEOGRAPHY_DATA_DIR;
  originalCountriesApiBaseUrl = process.env.COUNTRIES_API_BASE_URL;
  originalOsmNominatimBaseUrl = process.env.OSM_NOMINATIM_BASE_URL;
  process.env.COUNTRIES_API_BASE_URL = "https://countries.dev";
  testGeographyDataDirectory = await mkdtemp(path.join(tmpdir(), "geography-route-test-"));
  process.env.GEOGRAPHY_DATA_DIR = testGeographyDataDirectory;
});

afterEach(async () => {
  if (originalGeographyDataDirectory === undefined) delete process.env.GEOGRAPHY_DATA_DIR;
  else process.env.GEOGRAPHY_DATA_DIR = originalGeographyDataDirectory;
  if (originalCountriesApiBaseUrl === undefined) delete process.env.COUNTRIES_API_BASE_URL;
  else process.env.COUNTRIES_API_BASE_URL = originalCountriesApiBaseUrl;
  if (originalOsmNominatimBaseUrl === undefined) delete process.env.OSM_NOMINATIM_BASE_URL;
  else process.env.OSM_NOMINATIM_BASE_URL = originalOsmNominatimBaseUrl;
  if (testGeographyDataDirectory) {
    await rm(testGeographyDataDirectory, { recursive: true, force: true });
  }
  testGeographyDataDirectory = undefined;
});

function geoNamesZipResponse(countryCode: string, records: string[]) {
  const contents = records.join("\n");
  return new Response(zipSync({
    [`${countryCode}.txt`]: strToU8(contents),
  }));
}

function geoNamesRecord({
  id,
  name,
  featureClass,
  featureCode,
  countryCode,
  admin1Code = "",
  admin2Code = "",
  admin3Code = "",
  admin4Code = "",
  population = 0,
}: {
  id: string;
  name: string;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
  population?: number;
}) {
  return [
    id, name, name, "", "0", "0", featureClass, featureCode, countryCode, "",
    admin1Code, admin2Code, admin3Code, admin4Code, String(population),
  ].join("\t");
}

async function withTemporaryGeographyData(run: () => Promise<void>) {
  const originalDataDirectory = process.env.GEOGRAPHY_DATA_DIR;
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "geography-test-"));
  process.env.GEOGRAPHY_DATA_DIR = dataDirectory;
  try {
    await run();
  } finally {
    if (originalDataDirectory === undefined) delete process.env.GEOGRAPHY_DATA_DIR;
    else process.env.GEOGRAPHY_DATA_DIR = originalDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

test("region lookup returns unique GeoNames administrative divisions", async () => {
  await withTemporaryGeographyData(async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl: URL | undefined;
    globalThis.fetch = async (input) => {
      requestedUrl = new URL(input instanceof URL ? input.href : String(input));
      return geoNamesZipResponse("US", [
        geoNamesRecord({ id: "1", name: "Washington", featureClass: "A", featureCode: "ADM1", countryCode: "US", admin1Code: "WA" }),
        geoNamesRecord({ id: "2", name: " Oregon ", featureClass: "A", featureCode: "ADM1", countryCode: "US", admin1Code: "OR" }),
        geoNamesRecord({ id: "3", name: "Oregon", featureClass: "A", featureCode: "ADM1", countryCode: "US", admin1Code: "OR" }),
        geoNamesRecord({ id: "4", name: "Washington Region", featureClass: "A", featureCode: "ADM1", countryCode: "US", admin1Code: "WR" }),
      ]);
    };

    try {
      const response = await GET(new Request("http://localhost/api/geography?type=regions&country=US"));

      assert.equal(response.status, 200);
      assert.equal(requestedUrl?.origin, "https://download.geonames.org");
      assert.equal(requestedUrl?.pathname, "/export/dump/US.zip");
      assert.deepEqual(await response.json(), [
        { id: "2", name: "Oregon", code: "OR", level: 1, admin1Code: "OR", admin2Code: "", admin3Code: "", admin4Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
        { id: "1", name: "Washington", code: "WA", level: 1, admin1Code: "WA", admin2Code: "", admin3Code: "", admin4Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("city lookup uses the selected country and region", async () => {
  await withTemporaryGeographyData(async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl: URL | undefined;
    globalThis.fetch = async (input) => {
      requestedUrl = new URL(input instanceof URL ? input.href : String(input));
      return geoNamesZipResponse("US", [
        geoNamesRecord({ id: "1", name: "Washington", featureClass: "A", featureCode: "ADM1", countryCode: "US", admin1Code: "WA" }),
        geoNamesRecord({ id: "2", name: "Seattle", featureClass: "P", featureCode: "PPLA", countryCode: "US", admin1Code: "WA", population: 750000 }),
        geoNamesRecord({ id: "3", name: "Tacoma", featureClass: "P", featureCode: "PPL", countryCode: "US", admin1Code: "WA", population: 200000 }),
        geoNamesRecord({ id: "4", name: "Portland", featureClass: "P", featureCode: "PPLA", countryCode: "US", admin1Code: "OR", population: 600000 }),
      ]);
    };

    try {
      const response = await GET(new Request(
        "http://localhost/api/geography?type=cities&country=US&region=Washington&admin1=WA",
      ));

      assert.equal(response.status, 200);
      assert.equal(requestedUrl?.pathname, "/export/dump/US.zip");
      assert.deepEqual(await response.json(), [
        { name: "Seattle", countryCode: "US", geonameId: 2, featureCode: "PPLA", admin1Code: "WA", admin2Code: "", admin3Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
        { name: "Tacoma", countryCode: "US", geonameId: 3, featureCode: "PPL", admin1Code: "WA", admin2Code: "", admin3Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("administrative level lookup scopes options to the selected parent area", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => geoNamesZipResponse("US", [
      geoNamesRecord({ id: "1", name: "King County", featureClass: "A", featureCode: "ADM2", countryCode: "US", admin1Code: "WA", admin2Code: "033" }),
      geoNamesRecord({ id: "2", name: "King", featureClass: "A", featureCode: "ADM2", countryCode: "US", admin1Code: "WA", admin2Code: "033" }),
      geoNamesRecord({ id: "3", name: "Pierce County", featureClass: "A", featureCode: "ADM2", countryCode: "US", admin1Code: "WA", admin2Code: "053" }),
      geoNamesRecord({ id: "4", name: "Multnomah County", featureClass: "A", featureCode: "ADM2", countryCode: "US", admin1Code: "OR", admin2Code: "051" }),
    ]);

    try {
      const response = await GET(new Request(
        "http://localhost/api/geography?type=regions&country=US&level=2&admin1=WA",
      ));

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), [
        { id: "1", name: "King County", code: "033", level: 2, admin1Code: "WA", admin2Code: "033", admin3Code: "", admin4Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
        { id: "3", name: "Pierce County", code: "053", level: 2, admin1Code: "WA", admin2Code: "053", admin3Code: "", admin4Code: "", source: "GeoNames", sourceType: "external_dataset", isManual: false },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

test("unscoped city search uses Countries.dev with the selected country", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return Response.json([{ name: "Seattle", countryCode: "US" }]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=cities&country=US&q=Seat",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.origin, "https://countries.dev");
    assert.equal(requestedUrl.pathname, "/cities");
    assert.equal(requestedUrl.searchParams.get("country"), "US");
    assert.equal(requestedUrl.searchParams.get("q"), "Seat");
    assert.equal(requestedUrl.searchParams.get("limit"), "10");
    assert.deepEqual(await response.json(), [{
      name: "Seattle",
      countryCode: "US",
      source: "Countries.dev",
      sourceType: "external_api",
      isManual: false,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postal-code lookup uses Countries.dev and returns matching locations", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return Response.json([{
      postalCode: "98101",
      placeName: "Seattle",
      admin1: { name: "Washington" },
    }]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal&country=US&code=98101",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.origin, "https://countries.dev");
    assert.equal(requestedUrl.pathname, "/postal/US/98101");
    assert.deepEqual(await response.json(), [{
      postalCode: "98101",
      placeName: "Seattle",
      admin1: { name: "Washington" },
      source: "Countries.dev",
      sourceType: "external_api",
      isManual: false,
    }]);
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

test("suburb lookups require a selected city", async () => {
  const response = await GET(new Request(
    "http://localhost/api/geography?type=suburbs&country=NZ",
  ));

  assert.equal(response.status, 400);
});

test("country lookup includes national phone digit limits", async () => {
  const originalFetch = globalThis.fetch;
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
        name: "India",
        alpha2Code: "IN",
        callingCodes: ["91"],
        flag: "🇮🇳",
        nationalNumberMaxLength: 14,
        source: "Countries.dev",
        sourceType: "external_api",
        isManual: false,
      },
      {
        name: "New Zealand",
        alpha2Code: "NZ",
        callingCodes: ["64"],
        flag: "🇳🇿",
        nationalNumberMaxLength: 11,
        source: "Countries.dev",
        sourceType: "external_api",
        isManual: false,
      },
      {
        name: "United States",
        alpha2Code: "US",
        callingCodes: ["1"],
        flag: "🇺🇸",
        nationalNumberMaxLength: 11,
        source: "Countries.dev",
        sourceType: "external_api",
        isManual: false,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country lookup falls back to a built-in list when the remote API is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  process.env.COUNTRIES_API_BASE_URL = "https://countries.dev";
  globalThis.fetch = async () => new Response(null, { status: 503 });

  try {
    const response = await GET(new Request("http://localhost/api/geography?type=countries"));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.some((country) => country.alpha2Code === "US" && country.name === "United States"));
    assert.ok(data.some((country) => country.alpha2Code === "NZ"));
    assert.ok(data.every((country) => country.source === "local_metadata"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("country lookup uses local metadata when Countries.dev is not configured", async () => {
  const originalFetch = globalThis.fetch;
  delete process.env.COUNTRIES_API_BASE_URL;
  globalThis.fetch = async () => {
    throw new Error("Countries.dev should not be requested without a configured base URL.");
  };

  try {
    const response = await GET(new Request("http://localhost/api/geography?type=countries"));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.some((country) => country.alpha2Code === "US"));
    assert.ok(data.every((country) => country.source === "local_metadata"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("street lookup never falls back to public OpenStreetMap search servers", async () => {
  const originalFetch = globalThis.fetch;
  process.env.OSM_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
  globalThis.fetch = async () => {
    throw new Error("Public OpenStreetMap search must not be requested.");
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=streets&country=US&q=Main+Street",
    ));
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("self-hosted OpenStreetMap streets return unique options with provenance", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  process.env.OSM_NOMINATIM_BASE_URL = "http://localhost:8080/nominatim";
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(input instanceof URL ? input.href : String(input));
    return Response.json([
      { osm_id: 1, osm_type: "way", name: "Main Street", display_name: "Main Street", address: { road: "Main Street" } },
      { osm_id: 2, osm_type: "way", name: "Main Street", display_name: "Main Street, City", address: { road: "Main Street" } },
    ]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=streets&country=US&countryName=United+States&q=Main",
    ));

    assert.equal(response.status, 200);
    assert.equal(requestedUrl?.origin, "http://localhost:8080");
    assert.equal(requestedUrl?.pathname, "/nominatim/search");
    assert.deepEqual(await response.json(), [{
      name: "Main Street",
      externalId: "way/1",
      type: "street",
      source: "OpenStreetMap",
      sourceType: "local_dataset",
      isManual: false,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postal code lookup returns unique codes for the selected city and region", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return geoNamesZipResponse("US", [
      "US\t98101\tSeattle\tWashington",
      "US\t98101\tSeattle\tWashington",
      "US\t98001\tAuburn\tWashington",
      "US\t10001\tNew York\tNew York",
    ]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=US&city=Seattle&region=Washington",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.origin, "https://download.geonames.org");
    assert.equal(requestedUrl.pathname, "/export/zip/US.zip");
    assert.deepEqual(await response.json(), [{
      postalCode: "98101",
      type: "postal_code",
      source: "GeoNames",
      sourceType: "external_dataset",
      isManual: false,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postal code lookup normalizes city and region suffixes", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return geoNamesZipResponse("NZ", [
      "NZ\t6021\tWellington\tWellington",
      "NZ\t1642\tMount Wellington\tAuckland",
      "NZ\t5010\tWellington\tWellington",
    ]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=NZ&city=Wellington+City&region=Wellington+Region",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.pathname, "/export/zip/NZ.zip");
    assert.deepEqual(await response.json(), [
      { postalCode: "5010", type: "postal_code", source: "GeoNames", sourceType: "external_dataset", isManual: false },
      { postalCode: "6021", type: "postal_code", source: "GeoNames", sourceType: "external_dataset", isManual: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("suburb options return only unique localities verified within the selected city", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return geoNamesZipResponse("NZ", [
      "NZ\t0640\tNew Lynn\tAuckland",
      "NZ\t1026\tAvondale\tAuckland\tE7\tWaitakere\t\tAuckland",
      "NZ\t0602\tGlen Eden\tAuckland\tE7\tAuckland",
      "NZ\t2110\tPapakura\tAuckland\tE7\tPapakura",
      "NZ\t1010\tAuckland\tAuckland\tE7\tAuckland",
      "NZ\t6021\tWellington\tWellington",
      "US\t98101\tSeattle\tWashington",
    ]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=suburbs&country=NZ&city=Auckland&region=Auckland+Region",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.equal(requestedUrl.pathname, "/export/zip/NZ.zip");
    assert.deepEqual(await response.json(), [
      { name: "Avondale", type: "suburb", source: "GeoNames", sourceType: "external_dataset", isManual: false },
      { name: "Glen Eden", type: "suburb", source: "GeoNames", sourceType: "external_dataset", isManual: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postal codes and suburb-city relationships use only GeoNames records", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    requestedUrl = new URL(url);
    return geoNamesZipResponse("NZ", [
      "NZ\t0640\tNew Lynn\tAuckland",
      "NZ\t6021\tAuckland\tAuckland",
    ]);
  };

  try {
    const response = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=NZ&city=New+Lynn&region=Auckland",
    ));

    assert.equal(response.status, 200);
    assert.ok(requestedUrl);
    assert.deepEqual(await response.json(), [{
      postalCode: "0640",
      type: "postal_code",
      source: "GeoNames",
      sourceType: "external_dataset",
      isManual: false,
    }]);

    const unverifiedCityResponse = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=NZ&city=Auckland&suburb=New+Lynn&region=Auckland",
    ));
    assert.deepEqual(await unverifiedCityResponse.json(), []);

    const unrelatedRegionResponse = await GET(new Request(
      "http://localhost/api/geography?type=postal-codes&country=NZ&city=New+Lynn&region=Wellington",
    ));
    assert.deepEqual(await unrelatedRegionResponse.json(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
