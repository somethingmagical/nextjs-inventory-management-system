import { createReadStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { Unzip, UnzipInflate } from "fflate";

const cacheDurationMs = 30 * 24 * 60 * 60 * 1000;

export type GeoNamesRecord = {
  geonameId: string;
  name: string;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: string;
  admin2Code: string;
  admin3Code: string;
  admin4Code: string;
  latitude: number | null;
  longitude: number | null;
  population: number;
};

export type GeoNamesPostalPlace = {
  countryCode: string;
  postalCode: string;
  placeName: string;
  admin1: string;
  admin1Code: string;
  admin2: string;
  admin2Code: string;
  admin3: string;
  admin3Code: string;
};

const recordsCache = new Map<string, Promise<GeoNamesRecord[]>>();
const postalPlacesCache = new Map<string, Promise<GeoNamesPostalPlace[]>>();
const fileDownloads = new Map<string, Promise<string>>();

function getDataDirectory() {
  const configuredDirectory = process.env.GEOGRAPHY_DATA_DIR?.trim();
  return configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.join(process.cwd(), ".data", "geonames");
}

async function* readWebStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function getCachedArchive(countryCode: string, dataset: "dump" | "postal") {
  const dataDirectory = path.join(getDataDirectory(), dataset);
  const archivePath = path.join(dataDirectory, `${countryCode}.zip`);
  const cacheKey = archivePath;
  const currentDownload = fileDownloads.get(cacheKey);
  if (currentDownload) return currentDownload;

  const download = (async () => {
    try {
      const fileInfo = await stat(archivePath);
      if (Date.now() - fileInfo.mtimeMs < cacheDurationMs) return archivePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const url = dataset === "dump"
      ? new URL(`${countryCode}.zip`, "https://download.geonames.org/export/dump/")
      : new URL(`${countryCode}.zip`, "https://download.geonames.org/export/zip/");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GeoNames ${dataset} dataset request failed with status ${response.status}.`);
    }
    if (!response.body) {
      throw new Error(`GeoNames ${dataset} dataset response did not contain a file.`);
    }

    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = path.join(
      dataDirectory,
      `${countryCode}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      await pipeline(Readable.from(readWebStream(response.body)), createWriteStream(temporaryPath));
      await rename(temporaryPath, archivePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    return archivePath;
  })();

  fileDownloads.set(cacheKey, download);
  try {
    return await download;
  } catch (error) {
    fileDownloads.delete(cacheKey);
    throw error;
  }
}

async function readCountryLines(
  countryCode: string,
  dataset: "dump" | "postal",
  visitLine: (line: string) => void,
) {
  const archivePath = await getCachedArchive(countryCode, dataset);
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let dataFileFound = false;
  let resolveDataFile: (() => void) | undefined;
  let rejectDataFile: ((error: Error) => void) | undefined;
  const dataFileComplete = new Promise<void>((resolve, reject) => {
    resolveDataFile = resolve;
    rejectDataFile = reject;
  });

  unzip.onfile = (file) => {
    if (file.name !== `${countryCode}.txt`) return;
    dataFileFound = true;
    const decoder = new StringDecoder("utf8");
    let remaining = "";
    file.ondata = (error, chunk, final) => {
      if (error) {
        rejectDataFile?.(error);
        return;
      }

      try {
        remaining += decoder.write(chunk);
        let lineEnd = remaining.indexOf("\n");
        while (lineEnd !== -1) {
          visitLine(remaining.slice(0, lineEnd).replace(/\r$/, ""));
          remaining = remaining.slice(lineEnd + 1);
          lineEnd = remaining.indexOf("\n");
        }
        if (final) {
          remaining += decoder.end();
          if (remaining) visitLine(remaining.replace(/\r$/, ""));
          resolveDataFile?.();
        }
      } catch (lineError) {
        rejectDataFile?.(lineError instanceof Error ? lineError : new Error(String(lineError)));
      }
    };
    file.start();
  };

  for await (const chunk of createReadStream(/* turbopackIgnore: true */ archivePath)) {
    unzip.push(chunk);
  }
  unzip.push(new Uint8Array(0), true);
  if (!dataFileFound) {
    throw new Error(`GeoNames ${dataset} archive did not contain its country file.`);
  }
  await dataFileComplete;
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseGeoNamesRecord(line: string, countryCode: string): GeoNamesRecord | undefined {
  const fields = line.split("\t");
  if (fields[8]?.toUpperCase() !== countryCode || !fields[0] || !fields[1]) return undefined;
  return {
    geonameId: fields[0],
    name: fields[1].trim(),
    featureClass: fields[6] ?? "",
    featureCode: fields[7] ?? "",
    countryCode,
    admin1Code: fields[10] ?? "",
    admin2Code: fields[11] ?? "",
    admin3Code: fields[12] ?? "",
    admin4Code: fields[13] ?? "",
    latitude: parseNumber(fields[4]),
    longitude: parseNumber(fields[5]),
    population: Number(fields[14]) || 0,
  };
}

export async function getGeoNamesCountryRecords(countryCode: string) {
  const key = `${getDataDirectory()}:${countryCode}`;
  const cachedRecords = recordsCache.get(key);
  if (cachedRecords) return cachedRecords;

  const recordsValue: GeoNamesRecord[] = [];
  const records = readCountryLines(countryCode, "dump", (line) => {
    const record = parseGeoNamesRecord(line, countryCode);
    if (record && (record.featureClass === "A" || record.featureClass === "P")) {
      recordsValue.push(record);
    }
  }).then(() => recordsValue);
  recordsCache.set(key, records);
  try {
    return await records;
  } catch (error) {
    recordsCache.delete(key);
    throw error;
  }
}

function parseGeoNamesPostalPlace(line: string, countryCode: string): GeoNamesPostalPlace | undefined {
  const [
    recordCountryCode,
    postalCode,
    placeName,
    admin1,
    admin1Code,
    admin2,
    admin2Code,
    admin3,
    admin3Code,
  ] = line.split("\t");

  if (
    recordCountryCode?.toUpperCase() !== countryCode
    || !postalCode?.trim()
    || !placeName?.trim()
  ) {
    return undefined;
  }

  return {
    countryCode,
    postalCode: postalCode.trim(),
    placeName: placeName.trim(),
    admin1: admin1?.trim() ?? "",
    admin1Code: admin1Code?.trim() ?? "",
    admin2: admin2?.trim() ?? "",
    admin2Code: admin2Code?.trim() ?? "",
    admin3: admin3?.trim() ?? "",
    admin3Code: admin3Code?.trim() ?? "",
  };
}

export async function getGeoNamesPostalPlaces(countryCode: string) {
  const key = `${getDataDirectory()}:${countryCode}`;
  const cachedPlaces = postalPlacesCache.get(key);
  if (cachedPlaces) return cachedPlaces;

  const placesValue: GeoNamesPostalPlace[] = [];
  const places = readCountryLines(countryCode, "postal", (line) => {
    const place = parseGeoNamesPostalPlace(line, countryCode);
    if (place) placesValue.push(place);
  }).then(() => placesValue);
  postalPlacesCache.set(key, places);
  try {
    return await places;
  } catch (error) {
    postalPlacesCache.delete(key);
    throw error;
  }
}

