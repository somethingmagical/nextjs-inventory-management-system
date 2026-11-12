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
  zipCode: "1010",
  address: "1 Sample Street",
};

test("requires region and postal code for customers", () => {
  assert.equal(customerSchema.safeParse(validCustomer).success, true);
  assert.equal(customerSchema.safeParse({ ...validCustomer, region: "" }).success, false);
  assert.equal(customerSchema.safeParse({ ...validCustomer, zipCode: "" }).success, false);
});

test("allows an empty address", () => {
  assert.equal(customerSchema.safeParse({ ...validCustomer, address: "" }).success, true);
  assert.equal(customerSchema.safeParse({ ...validCustomer, address: "   " }).success, true);
});
