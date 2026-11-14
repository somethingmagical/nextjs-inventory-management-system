import assert from "node:assert/strict";
import test from "node:test";
import { customerSchema } from "./customer-schema";

const validCustomer = {
  name: "Sample Customer",
  email: "customer@example.com",
  phoneNumber: "+64 21 123 4567",
  dateOfBirth: "",
  country: "New Zealand",
  region: "Auckland",
  city: "Auckland",
  suburb: "",
  zipCode: "1010",
  address: "1 Sample Street",
};

test("allows administrative area and postal code to be omitted", () => {
  assert.equal(customerSchema.safeParse(validCustomer).success, true);
  const parsed = customerSchema.safeParse({ ...validCustomer, region: "", zipCode: "" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.region, null);
    assert.equal(parsed.data.zipCode, null);
  }
});

test("normalizes a repeated international calling code", () => {
  const parsed = customerSchema.safeParse({
    ...validCustomer,
    phoneNumber: "+64 +64 21 123 4567",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.phoneNumber, "+64211234567");
});

test("allows an empty address", () => {
  assert.equal(customerSchema.safeParse({ ...validCustomer, address: "" }).success, true);
  assert.equal(customerSchema.safeParse({ ...validCustomer, address: "   " }).success, true);
});

test("allows an optional suburb and stores an empty selection as null", () => {
  const parsed = customerSchema.safeParse(validCustomer);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.suburb, null);
});

test("validates and preserves structured address provenance", () => {
  const addressData = {
    countryCode: "NZ",
    country: {
      name: "New Zealand",
      type: "country",
      source: "Countries.dev",
      sourceType: "external_api",
      isManual: false,
    },
    administrativeAreas: [{
      name: "Auckland",
      type: "administrative_area",
      code: "AUK",
      level: 1,
      source: "GeoNames",
      sourceType: "external_dataset",
      isManual: false,
    }],
    city: {
      name: "Auckland",
      type: "city",
      source: "Countries.dev",
      sourceType: "external_api",
      isManual: false,
    },
    suburb: null,
    street: {
      name: "Queen Street",
      type: "street",
      source: "manual",
      sourceType: "manual",
      isManual: true,
    },
    postalCode: null,
    houseNumber: "1",
    buildingName: "",
    unitNumber: "",
    additionalAddress: "",
  };
  const parsed = customerSchema.safeParse({
    ...validCustomer,
    countryCode: "NZ",
    addressData: JSON.stringify(addressData),
  });

  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.addressData, addressData);
  assert.equal(customerSchema.safeParse({
    ...validCustomer,
    addressData: "{invalid-json",
  }).success, false);
});
