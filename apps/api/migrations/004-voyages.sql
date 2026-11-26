CREATE TABLE voyages (
  id TEXT PRIMARY KEY NOT NULL,
  playerId TEXT NOT NULL REFERENCES customers(id),
  playerName TEXT NOT NULL,
  billingCountry TEXT NOT NULL,
  portId TEXT NOT NULL REFERENCES ports(id),
  portName TEXT NOT NULL,
  performanceCountry TEXT NOT NULL,
  vesselId TEXT NOT NULL REFERENCES vessels(id),
  vesselName TEXT NOT NULL,
  productKey TEXT NOT NULL,
  taxLocation TEXT,
  startedAtMs INTEGER NOT NULL,
  endedAtMs INTEGER CHECK (endedAtMs >= startedAtMs),
  durationMs INTEGER GENERATED ALWAYS AS (endedAtMs - startedAtMs) STORED,
  isTest INTEGER NOT NULL CHECK (isTest IN (0, 1) AND (isTest = 0 OR endedAtMs IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX voyages_one_active_per_player ON voyages(playerId) WHERE endedAtMs IS NULL;
