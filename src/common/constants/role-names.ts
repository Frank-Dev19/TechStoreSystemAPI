export const RECEPTIONIST_ROLE_NAMES = ['receptionist', 'recepcionista'] as const;
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
