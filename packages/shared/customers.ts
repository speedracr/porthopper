export type CustomerSummary = {
  id: string;
  name: string;
  billingCountry: string;
  status: "Active" | "Suspended";
};

export type Customer = CustomerSummary & {
  username: string;
  email: string;
  residenceCountry: string;
  billingAddress: string | null;
  instellixCustomerReference: string | null;
};

export type CustomerInput = Pick<Customer,
  "name" | "username" | "email" | "residenceCountry" | "billingCountry" | "status"
>;

export type CustomerFieldErrors = Partial<Record<keyof CustomerInput, string>>;
