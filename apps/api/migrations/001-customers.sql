CREATE TABLE customers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  residenceCountry TEXT NOT NULL,
  billingCountry TEXT NOT NULL,
  billingAddress TEXT,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Suspended')),
  instellixCustomerReference TEXT UNIQUE
) STRICT;
