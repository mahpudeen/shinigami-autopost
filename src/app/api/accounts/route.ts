import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_CLIENT_ID,
  getDb,
  type AccountDoc,
  type AccountRole,
} from "@/lib/firebase-admin";
import { authenticateWithWorkOS, refreshAndSyncAccount } from "@/lib/workos";

const VALID_ROLES: AccountRole[] = ["poster", "voter", "both"];

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "••••••••";
  return `${token.slice(0, 6)}••••${token.slice(-6)}`;
}

function toSafeAccount(doc: AccountDoc) {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email,
    avatarUrl: doc.avatarUrl,
    role: doc.role,
    isActive: doc.isActive,
    clientId: doc.clientId,
    updatedAt: doc.updatedAt,
    accessTokenPreview: maskToken(doc.accessToken),
    refreshTokenPreview: maskToken(doc.refreshToken),
    hasAccessToken: Boolean(doc.accessToken),
    hasRefreshToken: Boolean(doc.refreshToken),
  };
}

function docToAccount(
  id: string,
  data: Record<string, unknown>
): AccountDoc {
  const role = VALID_ROLES.includes(data.role as AccountRole)
    ? (data.role as AccountRole)
    : "both";

  return {
    id,
    name: String(data.name || "Shinigami User"),
    email: String(data.email || ""),
    avatarUrl: String(data.avatarUrl || ""),
    role,
    isActive: typeof data.isActive === "boolean" ? data.isActive : true,
    accessToken: String(data.accessToken || ""),
    refreshToken: String(data.refreshToken || ""),
    clientId: String(data.clientId || DEFAULT_CLIENT_ID),
    updatedAt: Number(data.updatedAt ?? 0),
  };
}

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("accounts").get();

    const accounts = snap.docs
      .map((doc) => docToAccount(doc.id, doc.data()))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toSafeAccount);

    return NextResponse.json({
      ok: true,
      total: accounts.length,
      accounts,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat daftar akun.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      refreshToken?: string;
      accessToken?: string;
      clientId?: string;
      role?: AccountRole;
      isActive?: boolean;
    };

    const refreshToken = body.refreshToken?.trim() || "";
    const clientId = body.clientId?.trim() || DEFAULT_CLIENT_ID;
    const role: AccountRole = VALID_ROLES.includes(body.role as AccountRole)
      ? (body.role as AccountRole)
      : "both";
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (!refreshToken) {
      return NextResponse.json(
        { ok: false, error: "refresh_token wajib diisi." },
        { status: 400 }
      );
    }

    // Validate & rotate single-use refresh token immediately via WorkOS
    // and auto-extract name, email, avatarUrl from WorkOS response
    const profile = await authenticateWithWorkOS(refreshToken, clientId);
    const updatedAt = Date.now();

    const db = getDb();
    const ref = db.collection("accounts").doc();
    const accountData: Omit<AccountDoc, "id"> = {
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      role,
      isActive,
      accessToken: profile.accessToken || body.accessToken?.trim() || "",
      refreshToken: profile.refreshToken,
      clientId: profile.clientId,
      updatedAt,
    };

    await ref.set(accountData);

    const created: AccountDoc = { id: ref.id, ...accountData };
    return NextResponse.json(
      {
        ok: true,
        account: toSafeAccount(created),
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menambahkan akun.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string;
      action?: "refresh" | "update";
      role?: AccountRole;
      isActive?: boolean;
      refreshToken?: string;
      accessToken?: string;
      clientId?: string;
    };

    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID akun wajib disertakan." },
        { status: 400 }
      );
    }

    const db = getDb();
    const docRef = db.collection("accounts").doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "Akun tidak ditemukan." },
        { status: 404 }
      );
    }

    const existing = docToAccount(snap.id, snap.data() || {});

    if (body.action === "refresh") {
      const refreshed = await refreshAndSyncAccount(existing);
      return NextResponse.json({
        ok: true,
        message: `Token akun ${refreshed.name} berhasil di-refresh dan disimpan.`,
        account: toSafeAccount(refreshed),
      });
    }

    const patch: Partial<Omit<AccountDoc, "id">> = {
      updatedAt: Date.now(),
    };

    if (typeof body.isActive === "boolean") {
      patch.isActive = body.isActive;
    }
    if (body.role && VALID_ROLES.includes(body.role)) {
      patch.role = body.role;
    }
    if (typeof body.clientId === "string" && body.clientId.trim()) {
      patch.clientId = body.clientId.trim();
    }
    if (typeof body.accessToken === "string" && body.accessToken.trim()) {
      patch.accessToken = body.accessToken.trim();
    }
    if (typeof body.refreshToken === "string" && body.refreshToken.trim()) {
      // Immediately validate & rotate new refresh token via WorkOS
      const profile = await authenticateWithWorkOS(
        body.refreshToken.trim(),
        patch.clientId || existing.clientId
      );
      patch.name = profile.name;
      patch.email = profile.email;
      patch.avatarUrl = profile.avatarUrl;
      patch.accessToken = profile.accessToken;
      patch.refreshToken = profile.refreshToken;
      patch.clientId = profile.clientId;
    }

    await docRef.set(patch, { merge: true });

    const updated: AccountDoc = {
      ...existing,
      ...patch,
    };

    return NextResponse.json({
      ok: true,
      account: toSafeAccount(updated),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memperbarui akun.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      id = body.id?.trim() || "";
    }

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID akun wajib disertakan." },
        { status: 400 }
      );
    }

    const db = getDb();
    await db.collection("accounts").doc(id).delete();

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menghapus akun.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
