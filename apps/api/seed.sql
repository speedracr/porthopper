INSERT INTO customers
  (id, name, username, email, residenceCountry, billingCountry, status, instellixCustomerReference)
VALUES
  ('CUS-1001', 'Lena Hoffmann', 'lena_hoffmann', 'lena.hoffmann@players.porthopper.example', 'DE', 'DE', 'Active', 'MOCK-CUST-1001'),
  ('CUS-1002', 'Oliver Bennett', 'oliver_bennett', 'oliver.bennett@players.porthopper.example', 'GB', 'GB', 'Active', NULL),
  ('CUS-1003', 'Noor van Dijk', 'noor_vandijk', 'noor.vandijk@players.porthopper.example', 'NL', 'NL', 'Active', NULL),
  ('CUS-1004', 'Ingrid Solberg', 'ingrid_solberg', 'ingrid.solberg@players.porthopper.example', 'NO', 'NO', 'Active', NULL),
  ('CUS-1005', 'Freja Madsen', 'freja_madsen', 'freja.madsen@players.porthopper.example', 'DK', 'DK', 'Active', NULL),
  ('CUS-1006', 'Amélie Laurent', 'amelie_laurent', 'amelie.laurent@players.porthopper.example', 'FR', 'BE', 'Suspended', NULL),
  ('CUS-1007', 'Nils Lindström', 'nils_lindstrom', 'nils.lindstrom@players.porthopper.example', 'SE', 'SE', 'Active', NULL)
ON CONFLICT(id) DO NOTHING;
