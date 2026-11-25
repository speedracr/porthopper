import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import type { Customer, CustomerFieldErrors, CustomerSummary } from "../../../packages/shared/customers";

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Response(null, { status: response.status });
  return response.json() as Promise<T>;
}

export function loadCustomers({ request }: LoaderFunctionArgs) {
  return getJson<CustomerSummary[]>("/api/customers", request.signal);
}

export function loadCustomer({ request, params }: LoaderFunctionArgs) {
  if (!params.customerId) throw new Response(null, { status: 404 });
  return getJson<Customer>(`/api/customers/${encodeURIComponent(params.customerId)}`, request.signal);
}

export async function saveCustomer({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const id = params.customerId;
  const path = id ? `/api/customers/${encodeURIComponent(id)}` : "/api/customers";
  try {
    const response = await fetch(path, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
      signal: request.signal,
    });
    if (response.ok) {
      const customer: Customer = await response.json();
      return redirect(`/customers/${encodeURIComponent(customer.id)}`);
    }
    if (response.status === 409 || response.status === 422) {
      const { fields }: { fields: CustomerFieldErrors } = await response.json();
      return { fields };
    }
    if (response.status === 404 && id) return { error: "Customer not found." };
  } catch (error) {
    if (request.signal.aborted) throw error;
  }
  return { error: "Unable to save customer. Try again." };
}
