import { Hono, type Context } from "hono";
import type { Customer, CustomerFieldErrors, CustomerSummary } from "../../../packages/shared/customers.ts";
import { validateCustomerInput } from "./customer-input.ts";
import type { DatabaseSync } from "node:sqlite";
import { registerCatalogRoutes } from "./catalog.ts";

export function createApp(db: DatabaseSync) {
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
  const listCustomers = db.prepare("SELECT id, name, billingCountry, status FROM customers ORDER BY id");
  const getCustomer = db.prepare(`
    SELECT id, name, username, email, residenceCountry, billingCountry,
           billingAddress, status, instellixCustomerReference
    FROM customers WHERE id = ?
  `);
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, username, email, residenceCountry, billingCountry, status)
    SELECT printf('CUS-%04d', COALESCE(MAX(CAST(substr(id, 5) AS INTEGER)), 1000) + 1),
           ?, ?, ?, ?, ?, ?
    FROM customers
    RETURNING id
  `);
  const updateCustomer = db.prepare(`
    UPDATE customers SET name = ?, username = ?, email = ?, residenceCountry = ?,
      billingCountry = ?, status = ?
    WHERE id = ? RETURNING id
  `);
  const usernameOwner = db.prepare("SELECT id FROM customers WHERE username = ? COLLATE NOCASE");
  const emailOwner = db.prepare("SELECT id FROM customers WHERE email = ? COLLATE NOCASE");

  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.onError((_error, c) => c.json({ error: "Request failed" }, 500));
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.get("/api/customers", (c) => {
    const customers = listCustomers.all() as CustomerSummary[];
    return c.json(customers);
  });

  app.get("/api/customers/:id", (c) => {
    const id = c.req.param("id");
    if (!/^CUS-\d+$/.test(id)) return c.json({ error: "Invalid customer ID" }, 400);
    const customer = getCustomer.get(id) as Customer | undefined;
    if (!customer) return c.json({ error: "Customer not found" }, 404);
    return c.json(customer);
  });

  async function saveCustomer(c: Context, id?: string) {
    if (id !== undefined && !/^CUS-\d+$/.test(id)) {
      return c.json({ error: "Invalid customer ID" }, 400);
    }
    if (c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return c.json({ error: "Expected JSON" }, 415);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Expected a customer object" }, 400);
    }
    const result = validateCustomerInput(body as Record<string, unknown>);
    if ("fields" in result) return c.json({ fields: result.fields }, 422);
    const { name, username, email, residenceCountry, billingCountry, status } = result.input;
    const values = [name, username, email, residenceCountry, billingCountry, status];

    try {
      const row = id ? updateCustomer.get(...values, id) : insertCustomer.get(...values);
      if (!row) return c.json({ error: "Customer not found" }, 404);
      const customer = getCustomer.get(row.id) as Customer;
      return c.json(customer, id ? 200 : 201);
    } catch (error) {
      if (!(error instanceof Error) || !("errcode" in error) || error.errcode !== 2067) throw error;
      const fields: CustomerFieldErrors = {};
      const existingUsername = usernameOwner.get(username);
      const existingEmail = emailOwner.get(email);
      if (existingUsername && existingUsername.id !== id) fields.username = "Username is already in use.";
      if (existingEmail && existingEmail.id !== id) fields.email = "Email is already in use.";
      if (!Object.keys(fields).length) throw error;
      return c.json({ fields }, 409);
    }
  }

  app.post("/api/customers", (c) => saveCustomer(c));
  app.put("/api/customers/:id", (c) => saveCustomer(c, c.req.param("id")));

  registerCatalogRoutes(app, db);
  return app;
}
