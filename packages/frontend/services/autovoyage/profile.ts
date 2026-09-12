// The traveller's own details, keyed by their sign-in email. Three fields, because three
// is all anything downstream consumes: the supplier's BookingRequest takes exactly
// passengerName + passengerEmail, and the agent's system prompt takes a name to greet.
// Anything more would be stored and never read.
import { auth } from "~~/auth";
import { db } from "~~/services/db/supabase";

export type TravelerProfile = {
  /** Session identity and the row's primary key — never editable by the client. */
  signInEmail: string;
  fullName: string;
  /** Where confirmations go. Editable; falls back to signInEmail when blank. */
  contactEmail: string;
  phone: string;
  updatedAt?: string;
};

export type TravelerProfilePatch = {
  fullName?: string;
  contactEmail?: string;
  phone?: string;
};

// `auth` is typed with an overload for middleware use that TS otherwise picks up here;
// this module only ever calls it with no arguments to read the current session.
type AuthSession = { user?: { email?: string | null } } | null;
const getSession = auth as unknown as () => Promise<AuthSession>;

async function sessionEmail(): Promise<string | null> {
  const email = (await getSession())?.user?.email;
  return typeof email === "string" && email.length > 0 ? email.toLowerCase() : null;
}

function fromRow(signInEmail: string, row: Record<string, unknown> | null): TravelerProfile {
  return {
    signInEmail,
    fullName: (row?.full_name as string) ?? "",
    contactEmail: (row?.contact_email as string) ?? "",
    phone: (row?.phone as string) ?? "",
    updatedAt: row?.updated_at as string | undefined,
  };
}

/** The signed-in traveller's profile, or null when nobody is signed in. */
export async function getSessionProfile(): Promise<TravelerProfile | null> {
  const signInEmail = await sessionEmail();
  if (!signInEmail) return null;

  const { data, error } = await db().from("profiles").select().eq("email", signInEmail).maybeSingle();
  if (error) throw error;
  return fromRow(signInEmail, (data as Record<string, unknown> | null) ?? null);
}

/** Upserts the three editable fields. Legacy columns are left untouched, not blanked. */
export async function saveSessionProfile(patch: TravelerProfilePatch): Promise<TravelerProfile | null> {
  const signInEmail = await sessionEmail();
  if (!signInEmail) return null;

  const { data, error } = await db()
    .from("profiles")
    .upsert(
      {
        email: signInEmail,
        full_name: patch.fullName?.trim() ?? "",
        contact_email: patch.contactEmail?.trim() ?? "",
        phone: patch.phone?.trim() ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select()
    .single();
  if (error) throw error;
  return fromRow(signInEmail, data as Record<string, unknown>);
}

/**
 * The passenger a booking is made for, or null when the profile can't name one.
 * A booking needs a legal name; the email falls back to the sign-in address.
 */
export function bookingContact(profile: TravelerProfile): { name: string; email: string } | null {
  const name = profile.fullName.trim();
  if (!name) return null;
  return { name, email: profile.contactEmail.trim() || profile.signInEmail };
}

/**
 * Identity context for the agent's system prompt, or undefined when there's no name to
 * greet. Phone is deliberately left out — nothing downstream consumes it.
 */
export async function getSessionTraveler(): Promise<{ fullName: string; email: string } | undefined> {
  const profile = await getSessionProfile().catch(() => null);
  const contact = profile && bookingContact(profile);
  return contact ? { fullName: contact.name, email: contact.email } : undefined;
}
