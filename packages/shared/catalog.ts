export type CatalogKind = "ports" | "vessels";
export type CatalogStatus = "Active" | "Inactive";

export type CatalogSummary = {
  id: string;
  name: string;
  status: CatalogStatus;
};

export type Port = CatalogSummary & {
  countryCode: string;
  description: string | null;
};

export type Vessel = CatalogSummary & {
  category: string;
  description: string | null;
  productKey: string;
  instellixProductId: string | null;
};

export type CatalogRecord = Port | Vessel;
export type CatalogDetail = { record: CatalogRecord; assignments: CatalogSummary[] };
export type CatalogFieldErrors = Partial<Record<
  "name" | "status" | "description" | "countryCode" | "category" | "productKey" | "instellixProductId" | "portIds",
  string
>>;
