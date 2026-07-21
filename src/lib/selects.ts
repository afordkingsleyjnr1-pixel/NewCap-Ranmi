// Shared "safe" user projection — every query that nests a User relation
// must use this instead of `include: { user: true }`, which would leak
// passwordHash into API responses.
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  isAccountOwner: true,
  status: true,
} as const;
