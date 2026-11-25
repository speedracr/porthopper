CREATE TABLE ports (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  countryCode TEXT NOT NULL CHECK (countryCode GLOB '[A-Z][A-Z]'),
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive')),
  UNIQUE (name, countryCode)
) STRICT;

CREATE TABLE vessels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive')),
  productKey TEXT NOT NULL,
  instellixProductId TEXT
) STRICT;

CREATE TABLE vessel_ports (
  vesselId TEXT NOT NULL REFERENCES vessels(id),
  portId TEXT NOT NULL REFERENCES ports(id),
  PRIMARY KEY (vesselId, portId)
) STRICT;
CREATE INDEX vessel_ports_by_port ON vessel_ports(portId);
