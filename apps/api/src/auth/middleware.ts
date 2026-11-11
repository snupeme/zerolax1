import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyUserAccessToken, verifyAdminAccessToken } from "./tokens";
import { ApiError } from "../errors";
import type { AppConfig } from "../config";
import {
  findProfileById,
  touchUserActivity,
  type Db,
  type ProfileRow,
} from "@zerolax/db";
import { tashkentDateString } from "@zerolax/shared";
import { requirePermission } from "../services/admin-control";

export interface AdminPrincipal {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    profile?: ProfileRow;
    admin?: AdminPrincipal;
  }
}

const activityCache = new Set<string>();

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function createUserGuard(config: AppConfig, db: Db) {
  return async function requireUser(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const token = bearerToken(request);
    if (!token)
      throw new ApiError(401, "UNAUTHORIZED", "Authorization required");

    const { profileId } = await verifyUserAccessToken(config, token);
    const profile = await findProfileById(db, profileId);
    if (!profile) throw new ApiError(401, "UNAUTHORIZED", "Profile not found");
    if (profile.status === "blocked") {
      throw new ApiError(403, "ACCOUNT_BLOCKED", "Your account is blocked");
    }

    request.profile = profile;

    const date = tashkentDateString();
    const key = `${profile.id}:${date}`;
    if (!activityCache.has(key)) {
      activityCache.add(key);
      try {
        await touchUserActivity(db, profile.id, date);
      } catch (error) {
        activityCache.delete(key);
        request.log.warn({ err: error }, "failed to record user activity");
      }
    }
  };
}

export function createAdminGuard(config: AppConfig, db: Db) {
  return async function requireAdmin(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const token = bearerToken(request);
    if (!token)
      throw new ApiError(
        401,
        "ADMIN_UNAUTHORIZED",
        "Admin authorization required",
      );

    const { adminId } = await verifyAdminAccessToken(config, token);
    const rows = await db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }>("select id, email, name, role, status from admin_users where id = $1", [
      adminId,
    ]);

    const admin = rows[0];
    if (!admin || admin.status !== "active") {
      throw new ApiError(403, "ADMIN_FORBIDDEN", "Admin access denied");
    }

    request.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    const path = request.url.split("?")[0].replace(/^\/api\/admin/, "");
    if (
      request.url.startsWith("/api/admin/") &&
      !path.startsWith("/control/")
    ) {
      const write = !["GET", "HEAD"].includes(request.method);
      let scope = path.startsWith("/users")
        ? "users"
        : path.startsWith("/iq") || path.startsWith("/entrance")
          ? "exams"
          : path.startsWith("/notifications") || path.startsWith("/logs")
            ? "notifications"
            : path.startsWith("/audit")
              ? "audit"
              : path.startsWith("/overview")
                ? "analytics"
                : undefined;
      if (path.endsWith("/coins")) scope = "coins";
      if (scope)
        await requirePermission(
          db,
          request.admin,
          `${scope}.${write ? "write" : "read"}`,
        );
    }
  };
}

/** Test helper: reset the in-process activity cache. */
export function resetActivityCache(): void {
  activityCache.clear();
}
