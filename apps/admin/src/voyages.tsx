import {
  Form, Link, Route, isRouteErrorResponse, redirect, useActionData, useLoaderData, useNavigation,
  useRouteError, useSearchParams, type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { countryName } from "../../../packages/shared/countries";
import type { CatalogDetail, Port } from "../../../packages/shared/catalog";
import type { CustomerSummary } from "../../../packages/shared/customers";
import type { Voyage, Voyages } from "../../../packages/shared/voyages";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

const api = "/api/voyages";
const control = "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const utc = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });
const time = (timestamp: string) => `${utc.format(new Date(timestamp))} UTC`;
const minutes = new Intl.NumberFormat("en-GB", { maximumSignificantDigits: 8 });

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Response(null, { status: response.status });
  return response.json() as Promise<T>;
}

function list({ request }: LoaderFunctionArgs) {
  return get<Voyages>(api, request.signal);
}

function detail({ request, params }: LoaderFunctionArgs) {
  return get<Voyage>(`${api}/${encodeURIComponent(params.id!)}`, request.signal);
}

async function options({ request }: LoaderFunctionArgs) {
  const query = new URL(request.url).searchParams;
  const isTest = query.get("test") === "1";
  const [customers, allPorts, settings] = await Promise.all([
    get<CustomerSummary[]>("/api/customers", request.signal),
    get<Port[]>("/api/ports", request.signal),
    isTest ? get<Voyages>(api, request.signal) : undefined,
  ]);
  if (isTest && !settings?.canCreateTestVoyage) throw new Response(null, { status: 404 });
  const ports = allPorts.filter(({ status }) => status === "Active");
  const portId = ports.find(({ id }) => id === query.get("port"))?.id ?? "";
  const port = portId ? await get<CatalogDetail>(`/api/ports/${encodeURIComponent(portId)}`, request.signal) : undefined;
  return {
    isTest, portId, ports, players: customers.filter(({ status }) => status === "Active"),
    vessels: port?.assignments.filter(({ status }) => status === "Active") ?? [],
  };
}

async function post(request: Request, path: string, body?: object) {
  try {
    const response = await fetch(path, {
      method: "POST", signal: request.signal,
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (response.ok) {
      const voyage: Voyage = await response.json();
      return redirect(`/voyages/${encodeURIComponent(voyage.id)}`);
    }
    if ([404, 409, 422].includes(response.status)) {
      const { error }: { error: string } = await response.json();
      return { error };
    }
  } catch (error) {
    if (request.signal.aborted) throw error;
  }
  return { error: "Unable to save voyage. Try again." };
}

async function start({ request }: ActionFunctionArgs) {
  const data = await request.formData();
  const isTest = new URL(request.url).searchParams.get("test") === "1";
  const duration = data.get("durationSeconds");
  return post(request, isTest ? "/api/admin/voyages/test" : api, {
    playerId: data.get("playerId"), portId: data.get("portId"), vesselId: data.get("vesselId"),
    ...(isTest && { durationSeconds: typeof duration === "string" && duration.trim() ? Number(duration) : null }),
  });
}

function end({ request, params }: ActionFunctionArgs) {
  return post(request, `${api}/${encodeURIComponent(params.id!)}/end`);
}

function Breadcrumb() {
  return <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link className="record-link text-muted-foreground" to="/voyages">Voyages</Link></nav>;
}

function LoadError() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <><Breadcrumb /><h1>{missing ? "Not found" : "Voyages"}</h1>
    {!missing && <div className="table-panel empty-state" role="alert">
      <p>Unable to load voyages</p>
      <button className="admin-action mt-3" type="button" onClick={() => window.location.reload()}>Retry</button>
    </div>}
  </>;
}

function VoyageList() {
  const { voyages, canCreateTestVoyage } = useLoaderData<typeof list>();
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="mb-0">Voyages</h1>
      <div className="flex flex-wrap gap-2">
        {canCreateTestVoyage && <Link className="admin-action" to="new?test=1">Create test voyage</Link>}
        <Link className="admin-action admin-action-primary" to="new">Start voyage</Link>
      </div>
    </div>
    {voyages.length === 0 ? <p className="table-panel empty-state">No voyages found</p> :
      <div className="table-panel"><Table aria-label="Voyages">
        <TableHeader><TableRow>
          {['Player', 'Port', 'Vessel', 'Started at', 'Duration', 'Status'].map((label) => <TableHead key={label}>{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{voyages.map((voyage) => <TableRow key={voyage.id}>
          <TableCell><Link className="record-link font-medium" to={voyage.id}>{voyage.playerName}<span className="sr-only"> — {time(voyage.startedAt)}</span></Link></TableCell>
          <TableCell>{voyage.portName}</TableCell><TableCell>{voyage.vesselName}</TableCell>
          <TableCell>{time(voyage.startedAt)}</TableCell>
          <TableCell>{voyage.durationSeconds === null ? "—" : `${voyage.durationSeconds} s`}</TableCell>
          <TableCell>{voyage.status}{voyage.isTest ? " (test)" : ""}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
  </>;
}

function VoyageDetail() {
  const voyage = useLoaderData<typeof detail>();
  const result = useActionData<typeof end>();
  const saving = useNavigation().state !== "idle";
  const fields = [
    ["Voyage ID", voyage.id], ["Status", voyage.status], ["Player", voyage.playerName],
    ["Billing country", countryName(voyage.billingCountry)], ["Port", voyage.portName],
    ["Performance country", countryName(voyage.performanceCountry)], ["Vessel", voyage.vesselName],
    ["Product key", voyage.productKey], ["Started at", time(voyage.startedAt)],
    ["Ended at", voyage.endedAt ? time(voyage.endedAt) : "—"],
    ["Duration (seconds)", voyage.durationSeconds ?? "—"],
    ["Measured gameplay minutes", voyage.measuredMinutes === null ? "—" : minutes.format(voyage.measuredMinutes)],
  ];
  return <>
    <Breadcrumb />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="mb-0">{voyage.isTest ? "Test voyage" : "Voyage"}</h1>
      {voyage.status === "Active" && <Form method="post">
        <button className="admin-action admin-action-primary" disabled={saving}>{saving ? "Ending…" : "End voyage"}</button>
      </Form>}
    </div>
    {result?.error && <p className="mb-4 text-sm text-red-700" role="alert">{result.error}</p>}
    <dl className="table-panel grid gap-5 p-5 sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-words">{value}</dd></div>)}
    </dl>
  </>;
}

function StartVoyage() {
  const { isTest, portId, ports, players, vessels } = useLoaderData<typeof options>();
  const result = useActionData<typeof start>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [query, setQuery] = useSearchParams();
  const title = isTest ? "Create test voyage" : "Start voyage";
  return <>
    <Breadcrumb /><h1>{title}</h1>
    <Form method="post" className="table-panel max-w-2xl p-5">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 [&_label]:space-y-1.5 [&_label]:text-sm [&_label]:font-medium">
        <label><span>Player</span><select className={control} name="playerId" defaultValue="" required>
          <option value="" disabled>Select a player</option>
          {players.map(({ id, name }) => <option key={id} value={id}>{name} ({id})</option>)}
        </select></label>
        <label><span>Port</span><select className={control} name="portId" value={portId} required onChange={(event) => {
          const next = new URLSearchParams(query);
          next.set("port", event.target.value);
          setQuery(next, { replace: true });
        }}>
          <option value="" disabled>Select a port</option>
          {ports.map(({ id, name, countryCode }) => <option key={id} value={id}>{name} ({countryCode})</option>)}
        </select></label>
        <label><span>Vessel</span><select key={portId} className={control} name="vesselId" defaultValue="" required disabled={!vessels.length}>
          <option value="" disabled>{portId && !vessels.length ? "No available vessels" : "Select a vessel"}</option>
          {vessels.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        {isTest && <label><span>Duration (seconds)</span><input className={control} name="durationSeconds" type="number" min="0" step="0.001" required /></label>}
      </fieldset>
      {result?.error && <p className="mt-4 text-sm text-red-700" role="alert">{result.error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Link className="admin-action" to="/voyages">Cancel</Link>
        <button className="admin-action admin-action-primary" disabled={busy || !players.length || !vessels.length}>
          {navigation.formMethod ? "Saving…" : title}
        </button>
      </div>
    </Form>
  </>;
}

export const voyageRoutes = <Route path="/voyages" errorElement={<LoadError />} hydrateFallbackElement={<p role="status">Loading voyages…</p>}>
  <Route index loader={list} element={<VoyageList />} />
  <Route path="new" loader={options} action={start} element={<StartVoyage />} />
  <Route path=":id" loader={detail} action={end} element={<VoyageDetail />} />
</Route>;
