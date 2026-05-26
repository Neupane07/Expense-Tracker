import type { Role } from '../generated/prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
};
