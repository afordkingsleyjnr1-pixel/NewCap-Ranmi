$env:PGPASSWORD='Kingaford@1'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $psql -U postgres -h localhost -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'newcap_ranmi') THEN CREATE ROLE newcap_ranmi WITH LOGIN PASSWORD 'NewCapRanmi@1'; ELSE ALTER ROLE newcap_ranmi WITH PASSWORD 'NewCapRanmi@1'; END IF; END $$;"
$exists = (& $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = 'newcap_ranmi';").Trim()
if ($exists -ne '1') { & $psql -U postgres -h localhost -c "CREATE DATABASE newcap_ranmi OWNER newcap_ranmi;" }
& $psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE newcap_ranmi TO newcap_ranmi;"
Write-Host 'Database and user setup completed.'
