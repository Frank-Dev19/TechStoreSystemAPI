export function getEffectivePermissionCodes(user: any, at = new Date()): string[] {
  const effective = new Set<string>(
    (user?.roles ?? []).flatMap((role: any) =>
      (role.permissions ?? []).map((permission: any) => permission.code),
    ),
  );

  for (const override of user?.overrides ?? []) {
    if (override.expiresAt && new Date(override.expiresAt) <= at) continue;
    const code = override.permission?.code;
    if (!code) continue;

    if (override.effect === 'deny') effective.delete(code);
    if (override.effect === 'allow') effective.add(code);
  }

  return [...effective].sort();
}
