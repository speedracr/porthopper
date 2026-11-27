import {
  Form, Link, Route, isRouteErrorResponse, redirect, useActionData, useLoaderData, useNavigation, useRouteError,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { IntegrationConnection, loadIntegration } from "./integration";
import type { CatalogDetail, CatalogFieldErrors, CatalogKind, CatalogRecord, Port } from "../../../packages/shared/catalog";
import { countryCodes, countryName } from "../../../packages/shared/countries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

const countries = countryCodes.map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
const controlClass = "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";

async function load<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Response(null, { status: response.status });
  return response.json() as Promise<T>;
}

const sections = [
  { kind: "ports", title: "Ports", noun: "port" },
  { kind: "vessels", title: "Vessels", noun: "vessel" },
] as const;

export function Configuration() {
  const integration = useLoaderData<typeof loadIntegration>();
  return <><h1>Configuration</h1><ul className="table-panel divide-y">
    {sections.map(({ kind, title }) => <li key={kind}><Link className="record-link block px-5 py-3 text-sm font-medium" to={kind}>{title}</Link></li>)}
  </ul><IntegrationConnection initial={integration} /></>;
}

export function catalogRoutes() {
  return sections.map(({ kind, title, noun }) => {
    const base = `/configuration/${kind}`;
    const endpoint = `/api/${kind}`;
    const isPort = kind === "ports";
    const other: CatalogKind = isPort ? "vessels" : "ports";
    const list = ({ request }: LoaderFunctionArgs) => load<CatalogRecord[]>(endpoint, request.signal);
    const detail = ({ request, params }: LoaderFunctionArgs) =>
      load<CatalogDetail>(`${endpoint}/${encodeURIComponent(params.id!)}`, request.signal);
    async function formData(args: LoaderFunctionArgs) {
      const [current, ports] = await Promise.all([
        args.params.id ? detail(args) : undefined,
        isPort ? [] : load<Port[]>("/api/ports", args.request.signal),
      ]);
      return { current, ports };
    }

    async function save({ request, params }: ActionFunctionArgs) {
      const form = await request.formData();
      const id = params.id;
      try {
        const response = await fetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...Object.fromEntries(form), ...(!isPort && { portIds: form.getAll("portIds") }) }),
          signal: request.signal,
        });
        if (response.ok) {
          const { record }: CatalogDetail = await response.json();
          return redirect(`${base}/${encodeURIComponent(record.id)}`);
        }
        if (response.status === 409 || response.status === 422) {
          const { fields }: { fields: CatalogFieldErrors } = await response.json();
          return { fields };
        }
        if (response.status === 404) return { error: `${isPort ? "Port" : "Vessel"} not found.` };
      } catch (error) {
        if (request.signal.aborted) throw error;
      }
      return { error: `Unable to save ${noun}. Try again.` };
    }

    function Breadcrumb() {
      return <nav aria-label="Breadcrumb" className="mb-4 flex gap-2 text-sm text-muted-foreground">
        <Link className="record-link" to="/configuration">Configuration</Link><span aria-hidden="true">/</span>
        <Link className="record-link" to={base}>{title}</Link>
      </nav>;
    }

    function LoadError() {
      const error = useRouteError();
      const missing = isRouteErrorResponse(error) && error.status === 404;
      return <><Breadcrumb /><h1>{title}</h1><div className="table-panel empty-state" role="alert">
        <p>{missing ? `${isPort ? "Port" : "Vessel"} not found` : `Unable to load ${kind}`}</p>
        {!missing && <button className="admin-action mt-3" type="button" onClick={() => window.location.reload()}>Retry</button>}
      </div></>;
    }

    function List() {
      const records = useLoaderData<typeof list>();
      return <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="mb-0">{title}</h1>
          <Link className="admin-action admin-action-primary" to="new">Create {noun}</Link>
        </div>
        {records.length === 0 ? <p className="table-panel empty-state">No {kind} found</p> :
          <div className="table-panel"><Table aria-label={title}>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>{isPort ? "Country" : "Category"}</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>{records.map((record) => <TableRow key={record.id}>
              <TableCell><Link className="record-link font-medium" to={record.id}>{record.name}</Link></TableCell>
              <TableCell>{"countryCode" in record ? countryName(record.countryCode) : record.category}</TableCell>
              <TableCell>{record.status}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
      </>;
    }

    function Detail() {
      const { record, assignments } = useLoaderData<typeof detail>();
      const facts = "countryCode" in record
        ? [["Country", `${countryName(record.countryCode)} (${record.countryCode})`]]
        : [["Category", record.category], ["Product key", record.productKey], ["Instellix product ID", record.instellixProductId]];
      const assignmentLabel = isPort ? "Available vessels" : "Assigned ports";
      return <>
        <Breadcrumb />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="mb-0">{record.name}</h1><Link className="admin-action" to="edit">Edit {noun}</Link>
        </div>
        <dl className="table-panel grid gap-5 p-5 sm:grid-cols-2">
          {[["ID", record.id], ...facts, ["Status", record.status], ["Description", record.description]].map(([label, value]) =>
            value && <div key={label}><dt>{label}</dt><dd className="break-words whitespace-pre-wrap">{value}</dd></div>)}
        </dl>
        <section aria-labelledby="assignments" className="mt-9">
          <h2 id="assignments">{assignmentLabel}</h2>
          {assignments.length === 0 ? <p className="table-panel empty-state mt-3">No {other} assigned</p> :
            <div className="table-panel mt-3"><Table aria-label={assignmentLabel}>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{assignments.map(({ id, name, status }) => <TableRow key={id}>
                <TableCell><Link className="record-link font-medium" to={`/configuration/${other}/${id}`}>{name}</Link></TableCell>
                <TableCell>{status}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div>}
        </section>
      </>;
    }

    function Editor() {
      const { current, ports } = useLoaderData<typeof formData>();
      const result = useActionData<typeof save>();
      const saving = useNavigation().state !== "idle";
      const record = current?.record;
      const assigned = new Set(current?.assignments.map(({ id }) => id));
      const port = record && "countryCode" in record ? record : undefined;
      const vessel = record && "category" in record ? record : undefined;
      function props(name: keyof CatalogFieldErrors) {
        const error = result?.fields?.[name];
        return { id: name, name, className: controlClass, "aria-invalid": !!error || undefined, "aria-describedby": error ? `${name}-error` : undefined };
      }
      function errorFor(name: keyof CatalogFieldErrors) {
        const error = result?.fields?.[name];
        return error && <p id={`${name}-error`} role="alert" className="text-sm text-red-700">{error}</p>;
      }
      function field(name: keyof CatalogFieldErrors, label: string, control: React.ReactNode, wide = false) {
        return <div className={`space-y-1.5${wide ? " sm:col-span-2" : ""}`}>
          <label htmlFor={name} className="block text-sm font-medium">{label}</label>{control}{errorFor(name)}
        </div>;
      }
      return <>
        <Breadcrumb /><h1>{record ? "Edit" : "Create"} {noun}</h1>
        <Form key={record?.id ?? "new"} method="post" className="table-panel max-w-2xl p-5">
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            {field("name", "Name", <input {...props("name")} required maxLength={120} defaultValue={record?.name} />)}
            {field("status", "Status", <select {...props("status")} defaultValue={record?.status ?? "Active"}>
              <option>Active</option><option>Inactive</option>
            </select>)}
            {isPort ? field("countryCode", "Country", <select {...props("countryCode")} required defaultValue={port?.countryCode ?? ""}>
              <option value="" disabled>Select a country</option>
              {countries.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
            </select>) : <>
              {field("category", "Category", <input {...props("category")} required maxLength={80} defaultValue={vessel?.category} />)}
              {field("productKey", "Product key", <input {...props("productKey")} required maxLength={120} defaultValue={vessel?.productKey} />)}
              {field("instellixProductId", "Instellix product ID", <input {...props("instellixProductId")} maxLength={120} defaultValue={vessel?.instellixProductId ?? ""} />)}
            </>}
            {field("description", "Description", <textarea {...props("description")} rows={3} maxLength={1000} defaultValue={record?.description ?? ""} />, true)}
            {!isPort && <fieldset className="space-y-2 sm:col-span-2" aria-describedby={props("portIds")["aria-describedby"]}>
              <legend className="mb-2 text-sm font-medium">Assigned ports</legend>
              {ports.length === 0 && <p className="text-sm text-muted-foreground">No ports found</p>}
              {ports.map(({ id, name, status, countryCode }) => <label key={id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="portIds" value={id} defaultChecked={assigned.has(id)} />
                {name} ({countryCode}){status === "Inactive" ? " — Inactive" : ""}
              </label>)}
              {errorFor("portIds")}
            </fieldset>}
          </fieldset>
          {result?.error && <p className="mt-4 text-sm text-red-700" role="alert">{result.error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Link className="admin-action" to={record ? `${base}/${record.id}` : base}>Cancel</Link>
            <button className="admin-action admin-action-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : record ? "Save changes" : `Create ${noun}`}
            </button>
          </div>
        </Form>
      </>;
    }

    return <Route key={kind} path={base} errorElement={<LoadError />} hydrateFallbackElement={<p role="status">Loading {kind}…</p>}>
      <Route index loader={list} element={<List />} />
      <Route path="new" loader={formData} action={save} element={<Editor />} />
      <Route path=":id" loader={detail} element={<Detail />} />
      <Route path=":id/edit" loader={formData} action={save} element={<Editor />} />
    </Route>;
  });
}
