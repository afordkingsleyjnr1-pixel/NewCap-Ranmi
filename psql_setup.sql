DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'newcap_ranmi') THEN
    CREATE ROLE newcap_ranmi WITH LOGIN PASSWORD 'NewCapRanmi@1';
  ELSE
    ALTER ROLE newcap_ranmi WITH PASSWORD 'NewCapRanmi@1';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'newcap_ranmi') THEN
    CREATE DATABASE newcap_ranmi OWNER newcap_ranmi;
  END IF;
  GRANT ALL PRIVILEGES ON DATABASE newcap_ranmi TO newcap_ranmi;
END $$;
