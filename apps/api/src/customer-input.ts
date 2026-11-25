import { isCountryCode } from "../../../packages/shared/countries.ts";
import type { CustomerFieldErrors, CustomerInput } from "../../../packages/shared/customers.ts";

export function validateCustomerInput(body: Record<string, unknown>):
  { input: CustomerInput } | { fields: CustomerFieldErrors } {
  const get = (key: keyof CustomerInput) => {
    const value = body[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const name = get("name");
  const username = get("username");
  const email = get("email");
  const residenceCountry = get("residenceCountry").toUpperCase();
  const billingCountry = get("billingCountry").toUpperCase();
  const status = get("status");
  const fields: CustomerFieldErrors = {};

  if (!name || name.length > 120) fields.name = "Enter a name of up to 120 characters.";
  if (!/^[a-z0-9_.-]{1,64}$/i.test(username)) {
    fields.username = "Use up to 64 letters, numbers, dots, underscores or hyphens.";
  }
  if (email.length > 254 || !/^[\x21-\x7e]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email) ||
      email.split("@").length !== 2) {
    fields.email = "Enter a valid email address.";
  }
  if (!isCountryCode(residenceCountry)) fields.residenceCountry = "Select a country of residence.";
  if (!isCountryCode(billingCountry)) fields.billingCountry = "Select a billing country.";
  if (status !== "Active" && status !== "Suspended") {
    return { fields: { ...fields, status: "Select an account status." } };
  }
  if (Object.keys(fields).length) return { fields };

  return { input: { name, username, email, residenceCountry, billingCountry, status } };
}
