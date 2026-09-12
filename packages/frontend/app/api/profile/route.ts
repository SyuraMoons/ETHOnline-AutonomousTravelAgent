import { NextResponse } from "next/server";
import { auth } from "~~/auth";
import { db } from "~~/services/db/supabase";

type ProfilePayload = {
  fullName?: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: string;
  homeAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  walletAccountId?: string;
  walletNetwork?: string;
};

type AuthSession = { user?: { email?: string | null } } | null;

const getSession = auth as unknown as () => Promise<AuthSession>;

function getEmail(session: AuthSession): string | null {
  const email = session?.user?.email;
  return typeof email === "string" && email.length > 0 ? email.toLowerCase() : null;
}

function fromRow(row: Record<string, unknown>) {
  return {
    email: row.email,
    fullName: row.full_name ?? "",
    phone: row.phone ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    nationality: row.nationality ?? "",
    passportNumber: row.passport_number ?? "",
    passportExpiry: row.passport_expiry ?? "",
    homeAddress: row.home_address ?? {},
    walletAccountId: row.wallet_account_id ?? "",
    walletNetwork: row.wallet_network ?? "hedera:testnet",
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const session = await getSession();
  const email = getEmail(session);
  if (!email) return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });

  try {
    const { data, error } = await db().from("profiles").select().eq("email", email).maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ? fromRow(data as Record<string, unknown>) : { email });
  } catch (error) {
    console.error("Profile read failed", error);
    return NextResponse.json({ error: "Profile storage is not configured yet." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  const email = getEmail(session);
  if (!email) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });

  let payload: ProfilePayload;
  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return NextResponse.json({ error: "Send a valid JSON profile." }, { status: 400 });
  }

  const homeAddress = payload.homeAddress ?? {};
  const row = {
    email,
    full_name: payload.fullName?.trim() ?? "",
    phone: payload.phone?.trim() ?? "",
    date_of_birth: payload.dateOfBirth || null,
    nationality: payload.nationality?.trim() ?? "",
    passport_number: payload.passportNumber?.trim() ?? "",
    passport_expiry: payload.passportExpiry || null,
    home_address: homeAddress,
    wallet_account_id: payload.walletAccountId?.trim() ?? "",
    wallet_network: payload.walletNetwork?.trim() || "hedera:testnet",
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await db().from("profiles").upsert(row, { onConflict: "email" }).select().single();
    if (error) throw error;
    return NextResponse.json(fromRow(data as Record<string, unknown>));
  } catch (error) {
    console.error("Profile write failed", error);
    return NextResponse.json({ error: "Profile storage is not configured yet." }, { status: 503 });
  }
}