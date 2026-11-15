'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { AdminSchool, SchoolStaffMember } from '@/types';

/**
 * Data for the school admin console (/admin). Every read goes
 * through a school_admin_* RPC, each of which resolves the caller's school
 * itself and raises 'Not a school admin' for anyone else -- so there is no
 * school id to pass, and none to tamper with.
 *
 * All keys start with 'school-admin', so `useRefreshSchoolAdmin()` can
 * revalidate everything after a staff decision.
 */
const rpc = async <T>(fn: string): Promise<T> => {
  const { data, error } = await createClient().rpc(fn);
  if (error) throw new Error(error.message);
  return data as T;
};

function useSchoolAdminRpc<T>(fn: string) {
  const { session, isLoading } = useAuth();
  return useSWR<T>(!isLoading && session ? ['school-admin', fn, session.user.id] : null, () => rpc<T>(fn), {
    revalidateOnFocus: false,
  });
}

export const useAdminSchool = () => {
  const result = useSchoolAdminRpc<AdminSchool[]>('school_admin_school');
  return { ...result, data: result.data?.[0] ?? null };
};

export const useSchoolStaff = () => useSchoolAdminRpc<SchoolStaffMember[]>('school_admin_staff');

export function useRefreshSchoolAdmin() {
  const { mutate } = useSWRConfig();
  return () => mutate((key) => Array.isArray(key) && key[0] === 'school-admin');
}
