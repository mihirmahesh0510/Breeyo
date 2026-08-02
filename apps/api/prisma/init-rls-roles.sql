-- Create the application-level database role used at runtime.
-- This role does NOT own tables; RLS policies apply to it.
-- Run once per database, idempotent via DO block.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'breeyo_app') THEN
    CREATE ROLE breeyo_app WITH LOGIN PASSWORD 'app_dev_password';
  END IF;
END
$$;

-- breeyo_app can connect to the database
GRANT CONNECT ON DATABASE breeyo TO breeyo_app;

-- breeyo_app can use the public schema
GRANT USAGE ON SCHEMA public TO breeyo_app;
