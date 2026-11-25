import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { countryCodes, countryName } from "../../../packages/shared/countries";
import type { Customer, CustomerInput } from "../../../packages/shared/customers";
import { loadCustomer, saveCustomer } from "./customer-api";

const countries = countryCodes.map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const fields = [
  { name: "name", label: "Name", maxLength: 120 },
  { name: "username", label: "Username", maxLength: 64 },
  { name: "email", label: "Email", maxLength: 254, type: "email" },
] as const;

const controlClass = "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";

export function EditCustomer() {
  const customer = useLoaderData<typeof loadCustomer>();
  return <CustomerForm key={customer.id} customer={customer} />;
}

export function CustomerForm({ customer }: { customer?: Customer }) {
  const result = useActionData<typeof saveCustomer>();
  const saving = useNavigation().state !== "idle";
  const cancelTo = customer ? `/customers/${customer.id}` : "/customers";

  function controlProps(name: keyof CustomerInput) {
    const error = result?.fields?.[name];
    return {
      id: name,
      name,
      required: true,
      className: controlClass,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${name}-error` : undefined,
    };
  }

  function fieldError(name: keyof CustomerInput) {
    const error = result?.fields?.[name];
    return error && <p id={`${name}-error`} className="text-sm text-red-700" role="alert">{error}</p>;
  }

  return (
    <>
      <h1>{customer ? "Edit customer" : "Create customer"}</h1>
      <Form method="post" className="table-panel max-w-2xl p-5">
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div className="space-y-1.5" key={field.name}>
              <label className="block text-sm font-medium" htmlFor={field.name}>{field.label}</label>
              <input {...controlProps(field.name)} type={"type" in field ? field.type : "text"}
                maxLength={field.maxLength} defaultValue={customer?.[field.name]} />
              {fieldError(field.name)}
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="status">Account status</label>
            <select {...controlProps("status")} defaultValue={customer?.status ?? "Active"}>
              <option>Active</option>
              <option>Suspended</option>
            </select>
            {fieldError("status")}
          </div>
          {([
            ["residenceCountry", "Country of residence"],
            ["billingCountry", "Billing country"],
          ] as const).map(([name, label]) => (
            <div className="space-y-1.5" key={name}>
              <label className="block text-sm font-medium" htmlFor={name}>{label}</label>
              <select {...controlProps(name)} defaultValue={customer?.[name] ?? ""}>
                <option value="" disabled>Select a country</option>
                {countries.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
              </select>
              {fieldError(name)}
            </div>
          ))}
        </fieldset>
        {result?.error && <p className="mt-4 text-sm text-red-700" role="alert">{result.error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Link className="admin-action" to={cancelTo}>Cancel</Link>
          <button className="admin-action admin-action-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : customer ? "Save changes" : "Create customer"}
          </button>
        </div>
      </Form>
    </>
  );
}
