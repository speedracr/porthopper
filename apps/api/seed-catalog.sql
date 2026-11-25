INSERT INTO ports (id, name, countryCode, status) VALUES
  ('PRT-1001', 'Hamburg', 'DE', 'Active'),
  ('PRT-1002', 'Rotterdam', 'NL', 'Active'),
  ('PRT-1003', 'Gothenburg', 'SE', 'Active'),
  ('PRT-1004', 'Southampton', 'GB', 'Active');

INSERT INTO vessels (id, name, category, status, productKey) VALUES
  ('VSL-1001', 'Harbor Wren', 'Tugboat', 'Active', 'tugboat'),
  ('VSL-1002', 'Coastal Alder', 'Coastal freighter', 'Active', 'coastal-freighter'),
  ('VSL-1003', 'Meridian Star', 'Container ship', 'Active', 'container-ship');

INSERT INTO vessel_ports (vesselId, portId) VALUES
  ('VSL-1001', 'PRT-1001'), ('VSL-1001', 'PRT-1002'),
  ('VSL-1002', 'PRT-1001'), ('VSL-1002', 'PRT-1003'),
  ('VSL-1003', 'PRT-1002'), ('VSL-1003', 'PRT-1004');
