// Fixed permission list — Section 5.13, step 5.
export const PERMISSIONS = [
  "edit_firms",
  "manage_contacts",
  "send_outreach",
  "manage_meetings",
  "manage_tasks",
  "run_populate",
  "export_data",
  "manage_settings",
  "manage_team",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  edit_firms: "Edit firm details, Add Firm, trigger Reclassify",
  manage_contacts: "Manage contacts",
  send_outreach: "Send email / follow-up (requires connecting mailbox)",
  manage_meetings: "Schedule / reschedule / cancel meetings",
  manage_tasks: "Manage project tasks & checklists",
  run_populate: "Run Populate (find similar firms)",
  export_data: "Export CSV / XLSX",
  manage_settings: "Account settings (mandate band, API keys, Reclassify All)",
  manage_team: "Invite users, manage roles",
};

export const ADMIN_ROLE_NAME = "Admin";
export const EDITOR_ROLE_NAME = "Editor";
export const VIEWER_ROLE_NAME = "Viewer";

// Standard three-tier workspace roles — Admin has every permission
// (including workspace-level settings/team/billing-adjacent actions);
// Editor can do everything content-related (firms, contacts, outreach,
// meetings, tasks, Populate, export) but can't touch account settings or
// team/role management; Viewer is read-only. Used to seed the system
// default roles on bootstrap and via migration for already-provisioned
// databases — see prisma/migrations/*_editor_role.
export const EDITOR_PERMISSIONS: Permission[] = [
  "edit_firms",
  "manage_contacts",
  "send_outreach",
  "manage_meetings",
  "manage_tasks",
  "run_populate",
  "export_data",
];
