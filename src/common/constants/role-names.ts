export const ADMIN_ROLE_NAMES = ['admin'] as const;
export const RECEPTIONIST_ROLE_NAMES = ['receptionist', 'recepcionista', 'recepcionist'] as const;
export const TECHNICIAN_ROLE_NAMES = ['technician', 'tecnico'] as const;
export const SUPERVISOR_ROLE_NAMES = ['supervisor'] as const;

type NamedRole = { name?: string | null };

export const normalizeRoleName = (name?: string | null): string =>
  (name ?? '').trim().toLowerCase();

export const hasRoleName = (
  roles: NamedRole[] | undefined | null,
  allowed: readonly string[],
): boolean => {
  if (!roles?.length) {
    return false;
  }
  return roles.some((role) => {
    const normalized = normalizeRoleName(role?.name);
    return normalized ? allowed.includes(normalized) : false;
  });
};

export const hasElevatedServiceOrderRole = (roles: NamedRole[] | undefined | null): boolean =>
  hasRoleName(roles, ADMIN_ROLE_NAMES) ||
  hasRoleName(roles, SUPERVISOR_ROLE_NAMES) ||
  hasRoleName(roles, RECEPTIONIST_ROLE_NAMES);

export const isTechnicianScopedRoleSet = (roles: NamedRole[] | undefined | null): boolean =>
  hasRoleName(roles, TECHNICIAN_ROLE_NAMES) && !hasElevatedServiceOrderRole(roles);
