import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 10000;
const MAX_AVATAR_PIXELS = 25000000;

type ImageInfo = { mimeType: string; extension: string; width: number; height: number };

function dimensionsAreSafe(width: number, height: number) {
  return width > 0 && height > 0 && width <= MAX_AVATAR_DIMENSION && height <= MAX_AVATAR_DIMENSION && width * height <= MAX_AVATAR_PIXELS;
}

function validatePng(bytes: Buffer): ImageInfo | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!dimensionsAreSafe(width, height)) return null;

  let offset = 8;
  let foundEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (length > bytes.length || offset + 12 + length > bytes.length) return null;
    offset += 12 + length;
    if (type === "IEND") {
      if (length !== 0 || offset !== bytes.length) return null;
      foundEnd = true;
      break;
    }
  }
  return foundEnd ? { mimeType: "image/png", extension: "png", width, height } : null;
}

function validateJpeg(bytes: Buffer): ImageInfo | null {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return null;
  }

  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      height = bytes.readUInt16BE(offset + 3);
      width = bytes.readUInt16BE(offset + 5);
    }
    offset += segmentLength;
  }
  return dimensionsAreSafe(width, height) ? { mimeType: "image/jpeg", extension: "jpg", width, height } : null;
}

function validateWebp(bytes: Buffer): ImageInfo | null {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP" ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  ) {
    return null;
  }

  let offset = 12;
  let width = 0;
  let height = 0;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > bytes.length) return null;
    if (kind === "VP8X" && length >= 10) {
      width = 1 + bytes.readUIntLE(dataOffset + 4, 3);
      height = 1 + bytes.readUIntLE(dataOffset + 7, 3);
    } else if (kind === "VP8 " && length >= 10 && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01 && bytes[dataOffset + 5] === 0x2a) {
      width = bytes.readUInt16LE(dataOffset + 6) & 0x3fff;
      height = bytes.readUInt16LE(dataOffset + 8) & 0x3fff;
    } else if (kind === "VP8L" && length >= 5 && bytes[dataOffset] === 0x2f) {
      width = 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8);
      height = 1 + (bytes[dataOffset + 2] >> 6) + (bytes[dataOffset + 3] << 2) + ((bytes[dataOffset + 4] & 0x0f) << 10);
    }
    offset = dataOffset + length + (length % 2);
  }

  return dimensionsAreSafe(width, height) ? { mimeType: "image/webp", extension: "webp", width, height } : null;
}

function validateImage(bytes: Buffer) {
  return validatePng(bytes) ?? validateJpeg(bytes) ?? validateWebp(bytes);
}

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

export function registerAccountAvatarRoute(app: Express) {
  app.get("/api/account/rides/:rideId/rider-avatar", async (req: Request, res: Response) => {
    const accessToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const rideId = req.params.rideId;
    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      sendError(res, 503, "Private rider profile images are not configured.");
      return;
    }
    if (!accessToken || accessToken.length > 8192 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rideId)) {
      sendError(res, 401, "A valid driver session and ride are required.");
      return;
    }

    try {
      const authHeaders = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
      const identityResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders });
      if (!identityResponse.ok) {
        sendError(res, 401, "Your sign-in has expired.");
        return;
      }
      const accessResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_active_pickup_avatar_paths`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!accessResponse.ok) {
        console.error(`[AccountAvatar] Pickup authorization failed with status ${accessResponse.status}`);
        sendError(res, 502, "Rider picture access could not be verified.");
        return;
      }
      const activePickups = await accessResponse.json() as Array<{ ride_id: string; avatar_path: string }>;
      const activePickup = activePickups.find(item => item.ride_id === rideId && item.avatar_path);
      if (!activePickup) {
        sendError(res, 404, "No rider picture is available for this active pickup.");
        return;
      }

      const imageUrl = `${supabaseUrl}/storage/v1/object/account-avatars/${activePickup.avatar_path.split("/").map(encodeURIComponent).join("/")}`;
      const imageResponse = await fetch(imageUrl, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!imageResponse.ok) {
        console.error(`[AccountAvatar] Private image fetch failed with status ${imageResponse.status}`);
        sendError(res, 502, "The rider picture could not be loaded.");
        return;
      }
      const contentType = imageResponse.headers.get("content-type");
      if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType.split(";")[0].trim().toLowerCase())) {
        sendError(res, 502, "The stored rider picture has an unsupported format.");
        return;
      }
      const image = new Uint8Array(await imageResponse.arrayBuffer());
      if (image.length === 0 || image.length > MAX_AVATAR_BYTES) {
        sendError(res, 502, "The stored rider picture is invalid.");
        return;
      }
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });
      res.status(200).send(Buffer.from(image));
    } catch (error) {
      console.error("[AccountAvatar] Authorized rider image fetch failed:", error);
      sendError(res, 502, "The rider picture could not be loaded.");
    }
  });

  app.post("/api/account/delete", async (req: Request, res: Response) => {
    const accessToken = req.body?.accessToken;
    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      sendError(res, 503, "Account deletion is not configured.");
      return;
    }
    if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) {
      sendError(res, 401, "Sign in again to delete your account.");
      return;
    }

    try {
      const userHeaders = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
      const identityResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: userHeaders });
      if (!identityResponse.ok) {
        sendError(res, 401, "Your sign-in has expired. Sign in again and retry.");
        return;
      }
      const identity = await identityResponse.json() as { id?: string };
      if (!identity.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.id)) {
        sendError(res, 401, "The signed-in account could not be verified.");
        return;
      }

      const permissionResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/can_delete_my_account`, {
        method: "POST",
        headers: { ...userHeaders, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!permissionResponse.ok) {
        console.error(`[AccountDelete] Ride eligibility check failed with status ${permissionResponse.status}`);
        sendError(res, 502, "Account deletion could not be verified. Please try again.");
        return;
      }
      const canDelete = await permissionResponse.json();
      if (canDelete !== true) {
        sendError(res, 409, "Complete or cancel your active ride before deleting your account.");
        return;
      }

      let avatarPath: string | null = null;
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=avatar_path&auth_user_id=eq.${encodeURIComponent(identity.id)}`,
        { headers: userHeaders },
      );
      if (profileResponse.ok) {
        const profiles = await profileResponse.json() as Array<{ avatar_path: string | null }>;
        avatarPath = profiles[0]?.avatar_path ?? null;
      } else {
        console.error(`[AccountDelete] Profile lookup failed with status ${profileResponse.status}`);
        sendError(res, 502, "Account deletion could not be prepared. Please try again.");
        return;
      }

      const deletionResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(identity.id)}`,
        {
          method: "DELETE",
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        },
      );
      if (!deletionResponse.ok) {
        console.error(`[AccountDelete] Auth provider rejected deletion with status ${deletionResponse.status}`);
        sendError(res, 502, "Your account could not be deleted. Please try again.");
        return;
      }

      let cleanupWarning = false;
      if (avatarPath) {
        const cleanupResponse = await fetch(`${supabaseUrl}/storage/v1/object/account-avatars`, {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: [avatarPath] }),
        });
        cleanupWarning = !cleanupResponse.ok;
        if (cleanupWarning) console.error(`[AccountDelete] Private avatar cleanup failed with status ${cleanupResponse.status}`);
      }

      res.status(200).json({ success: true, cleanupWarning });
    } catch (error) {
      console.error("[AccountDelete] Deletion failed:", error);
      sendError(res, 502, "Your account could not be deleted. Please try again.");
    }
  });

  app.post("/api/account/avatar", async (req: Request, res: Response) => {
    const accessToken = req.body?.accessToken;
    const encoded = req.body?.imageBase64;
    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

    if (!supabaseUrl || !anonKey) {
      sendError(res, 503, "Account picture storage is not configured.");
      return;
    }
    if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) {
      sendError(res, 401, "Sign in again to upload a profile picture.");
      return;
    }
    if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      sendError(res, 400, "Choose an image smaller than 5 MB.");
      return;
    }

    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES || bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      sendError(res, 400, "The selected image is invalid or larger than 5 MB.");
      return;
    }
    const image = validateImage(bytes);
    if (!image) {
      sendError(res, 400, "Use a valid JPEG, PNG, or WebP image with supported dimensions.");
      return;
    }

    try {
      const identityResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!identityResponse.ok) {
        sendError(res, 401, "Your sign-in has expired. Sign in again and retry.");
        return;
      }
      const identity = await identityResponse.json() as { id?: string };
      if (!identity.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.id)) {
        sendError(res, 401, "The signed-in account could not be verified.");
        return;
      }

      const path = `${identity.id}/${randomUUID()}.${image.extension}`;
      const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/account-avatars/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": image.mimeType,
          "x-upsert": "false",
        },
        body: new Uint8Array(bytes),
      });
      if (!storageResponse.ok) {
        console.error(`[AccountAvatar] Storage rejected upload with status ${storageResponse.status}`);
        sendError(res, 502, "The profile picture could not be stored. Please try again.");
        return;
      }
      res.status(201).json({ path });
    } catch (error) {
      console.error("[AccountAvatar] Upload failed:", error);
      sendError(res, 502, "The profile picture could not be uploaded. Please try again.");
    }
  });
}
