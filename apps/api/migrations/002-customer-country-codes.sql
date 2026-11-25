CREATE TEMP TABLE legacy_country_codes (name TEXT PRIMARY KEY, code TEXT NOT NULL);
INSERT INTO legacy_country_codes VALUES
  ('Belgium', 'BE'), ('Denmark', 'DK'), ('France', 'FR'), ('Germany', 'DE'),
  ('Netherlands', 'NL'), ('Norway', 'NO'), ('Sweden', 'SE'), ('United Kingdom', 'GB');

UPDATE customers SET
  residenceCountry = COALESCE((SELECT code FROM legacy_country_codes WHERE name = residenceCountry), residenceCountry),
  billingCountry = COALESCE((SELECT code FROM legacy_country_codes WHERE name = billingCountry), billingCountry);

DROP TABLE legacy_country_codes;

CREATE UNIQUE INDEX customers_username_nocase ON customers (username COLLATE NOCASE);
CREATE UNIQUE INDEX customers_email_nocase ON customers (email COLLATE NOCASE);
