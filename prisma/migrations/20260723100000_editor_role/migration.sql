-- Standard three-tier roles: Admin / Editor / Viewer. Admin and Viewer were
-- already seeded on first bootstrap; this adds the missing Editor role for
-- databases that bootstrapped before Editor existed. Idempotent.
INSERT INTO "roles" ("id", "name", "permissions", "data_scope", "is_system_default", "created_at")
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Editor',
  '["edit_firms","manage_contacts","send_outreach","manage_meetings","manage_tasks","run_populate","export_data"]'::jsonb,
  'all_firms',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
