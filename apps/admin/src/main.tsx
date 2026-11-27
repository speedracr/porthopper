import { Anchor, LayoutDashboard, ReceiptText, Settings, Ship, Users } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, createRoutesFromElements, isRouteErrorResponse, Link, NavLink, Outlet, Route, RouterProvider, useLoaderData, useRouteError } from "react-router";
import { ResizableTableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useTableWidths } from "./components/ui/table";
import { loadCustomer, loadCustomers, saveCustomer } from "./customer-api";
import { CustomerForm, EditCustomer } from "./customer-form";
import { countryName } from "../../../packages/shared/countries";
import { catalogRoutes, Configuration } from "./catalog";
import { voyageRoutes } from "./voyages";
import { loadIntegration, testIntegration } from "./integration";
import "./styles.css";

const navigation = [
  { to: "/", title: "Dashboard", icon: LayoutDashboard, empty: "No activity yet" },
  { to: "/customers", title: "Customers", icon: Users },
  { to: "/voyages", title: "Voyages", icon: Ship },
  { to: "/billing", title: "Billing", icon: ReceiptText, empty: "No billing activity" },
  { to: "/configuration", title: "Configuration", icon: Settings },
];

function Shell() {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="border-b bg-sidebar px-4 py-5 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <Link to="/" className="mb-7 flex w-fit items-center gap-3 rounded-md px-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-white">
            <Anchor size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Port Hopper</span>
        </Link>
        <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto md:flex-col">
          {navigation.map(({ to, title, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className="nav-link flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground">
              <Icon size={17} aria-hidden="true" />
              {title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-[76rem] px-5 py-9 sm:px-9 lg:px-12 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

function Customers() {
  const customers = useLoaderData<typeof loadCustomers>();
  const columns = useTableWidths([220, 135, 155, 105]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="mb-0">Customers</h1>
        <Link className="admin-action admin-action-primary" to="/customers/new">Create customer</Link>
      </div>
      {customers.length === 0 ? <p className="table-panel empty-state">No customers found</p> : (
      <div className="table-panel">
        <Table aria-label="Customers" className="resizable-table w-full caption-bottom text-sm" style={{ minWidth: columns.totalWidth + 104 }}>
          <TableHeader>
            <TableRow>
              <ResizableTableHead label="Customer" minWidth={110} {...columns.column(0)} />
              <ResizableTableHead label="Customer ID" minWidth={130} {...columns.column(1)} />
              <ResizableTableHead label="Billing country" minWidth={145} {...columns.column(2)} />
              <ResizableTableHead label="Status" minWidth={85} {...columns.column(3)} />
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link className="record-link block truncate font-medium" to={customer.id} title={customer.name}>{customer.name}</Link>
                </TableCell>
                <TableCell><span className="record-id">{customer.id}</span></TableCell>
                <TableCell><span className="block truncate" title={countryName(customer.billingCountry)}>{countryName(customer.billingCountry)}</span></TableCell>
                <TableCell>{customer.status}</TableCell>
                <TableCell>
                  <Link className="row-action" to={customer.id} aria-label={`Show ${customer.name}`}>Show</Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </>
  );
}

function CustomerBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <Link className="record-link text-muted-foreground" to="/customers">Customers</Link>
    </nav>
  );
}

function CustomerLoadError({ detail = false }: { detail?: boolean }) {
  const error = useRouteError();
  const missing = detail && isRouteErrorResponse(error) && [400, 404].includes(error.status);
  return (
    <>
      {detail && <CustomerBreadcrumb />}
      <h1>{detail ? (missing ? "Customer not found" : "Customer") : "Customers"}</h1>
      {!missing && (
        <div className="table-panel empty-state" role="alert">
          <p>{detail ? "Unable to load customer" : "Unable to load customers"}</p>
          <button className="mt-3 rounded-md border bg-background px-3 py-1.5 font-medium text-primary" type="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
    </>
  );
}

function CustomerDetail() {
  const customer = useLoaderData<typeof loadCustomer>();

  return (
    <>
      <CustomerBreadcrumb />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="mb-0">{customer.name}</h1>
        <Link className="admin-action" to="edit">Edit customer</Link>
      </div>
      <dl className="table-panel grid gap-5 px-5 py-5 sm:grid-cols-2">
        <div>
          <dt>Customer ID</dt>
          <dd className="record-id">{customer.id}</dd>
        </div>
        <div>
          <dt>Username</dt>
          <dd>{customer.username}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd className="break-all">{customer.email}</dd>
        </div>
        <div>
          <dt>Country of residence</dt>
          <dd>{countryName(customer.residenceCountry)}</dd>
        </div>
        <div>
          <dt>Billing country</dt>
          <dd>{countryName(customer.billingCountry)}</dd>
        </div>
        {customer.billingAddress && (
          <div>
            <dt>Billing address</dt>
            <dd>{customer.billingAddress}</dd>
          </div>
        )}
        <div>
          <dt>Account status</dt>
          <dd>{customer.status}</dd>
        </div>
        {customer.instellixCustomerReference && (
          <div>
            <dt>Instellix customer reference</dt>
            <dd className="record-id">{customer.instellixCustomerReference}</dd>
          </div>
        )}
      </dl>
      <section aria-labelledby="customer-voyages" className="mt-9">
        <h2 id="customer-voyages">Voyages</h2>
        <p className="table-panel empty-state mt-3">No voyages to display</p>
      </section>
    </>
  );
}

const router = createBrowserRouter(createRoutesFromElements(
        <Route element={<Shell />}>
          <Route path="/customers" loader={loadCustomers} element={<Customers />} errorElement={<CustomerLoadError />} hydrateFallbackElement={<p role="status">Loading customers…</p>} />
          <Route path="/customers/new" action={saveCustomer} element={<CustomerForm />} />
          <Route path="/customers/:customerId" loader={loadCustomer} element={<CustomerDetail />} errorElement={<CustomerLoadError detail />} hydrateFallbackElement={<p role="status">Loading customer…</p>} />
          <Route path="/customers/:customerId/edit" loader={loadCustomer} action={saveCustomer} element={<EditCustomer />} errorElement={<CustomerLoadError detail />} hydrateFallbackElement={<p role="status">Loading customer…</p>} />
          <Route path="/configuration" loader={loadIntegration} action={testIntegration} element={<Configuration />} errorElement={<><h1>Configuration</h1><p role="alert">Unable to load configuration.</p><Link className="admin-action mt-3" to="/configuration">Retry</Link></>} hydrateFallbackElement={<p role="status">Loading configuration…</p>} />
          {catalogRoutes()}
          {voyageRoutes}
          {navigation.map(({ to, title, empty }) => empty && (
            <Route key={to} path={to} element={<><h1>{title}</h1><p className="table-panel empty-state">{empty}</p></>} />
          ))}
          <Route path="*" element={<h1>Page not found</h1>} />
        </Route>
));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
