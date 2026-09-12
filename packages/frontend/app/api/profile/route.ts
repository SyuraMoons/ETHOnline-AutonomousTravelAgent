import { NextRequest, NextResponse } from "next/server";
import { type TravelerProfilePatch, getSessionProfile, saveSessionProfile } from "~~/services/autovoyage/profile";

// Three fields, because three is all anything downstream reads — see
// services/autovoyage/profile.ts. The row's primary key is the session's sign-in email and
// is never taken from the payload.
export async function GET() {
  try {
    const profile = await getSessionProfile();
    if (!profile) return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const payload = (await req.json().catch(() => null)) as TravelerProfilePatch | null;
  if (!payload) return NextResponse.json({ error: "Send a valid JSON profile." }, { status: 400 });

  try {
    const profile = await saveSessionProfile({
      fullName: payload.fullName,
      contactEmail: payload.contactEmail,
      phone: payload.phone,
    });
    if (!profile) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the profile" },
      { status: 500 },
    );
  }
}
