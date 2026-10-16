/**
 * Pure policy for user-administration mutations (Phase 3).
 *
 * The rule this file encodes is a domain invariant, not a UI nicety: a system with ZERO admins can
 * no longer create users, reset passwords or change roles, so it would have to be repaired in the
 * database. `server/routes/users.ts` therefore asks this function before it demotes or deletes an
 * admin account.
 *
 * It is kept free of Express/Drizzle so the whole decision table can be unit-tested without a
 * database — including the "only one admin left" branch, which is impossible to reach against a
 * live database that already holds other real admins.
 */

export const LAST_ADMIN_MESSAGE =
  'این کاربر تنها مدیر ارشد سامانه است؛ تغییر نقش یا حذف او باعث قفل‌شدن مدیریت کاربران می‌شود.';

export interface AdminMutationInput {
  /** ids of EVERY admin account currently in the system (the target included when it is an admin). */
  adminIds: string[];
  /** the account being changed or removed. */
  targetId: string;
  /** the role the account is being changed TO. Ignored when `isDelete` is true. */
  nextRole?: string | null;
  /** true when the operation removes the account. */
  isDelete?: boolean;
}

export interface AdminMutationDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether a role-change / delete is allowed.
 *
 * - target is not an admin                       -> allowed (no admin is lost)
 * - target stays an admin                        -> allowed
 * - target loses admin rights and it is the last -> REFUSED
 * - target loses admin rights but others remain  -> allowed
 */
export const evaluateAdminMutation = (input: AdminMutationInput): AdminMutationDecision => {
  const targetIsAdmin = input.adminIds.includes(input.targetId);
  if (!targetIsAdmin) return { allowed: true };

  const staysAdmin = !input.isDelete && String(input.nextRole ?? 'ADMIN').toUpperCase() === 'ADMIN';
  if (staysAdmin) return { allowed: true };

  if (input.adminIds.length <= 1) {
    return { allowed: false, reason: LAST_ADMIN_MESSAGE };
  }
  return { allowed: true };
};
