"use client";

// Profile page — the three details the agent needs to book for you, and nothing else.
// Whatever is saved here is what /api/execute sends as the passenger, so booking never
// asks for a name or an email again.
import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonProfileForm } from "~~/components/autovoyage/ui/Skeleton";
import { UserIcon } from "~~/components/autovoyage/ui/icons";

type Profile = {
  signInEmail: string;
  fullName: string;
  contactEmail: string;
  phone: string;
};

const emptyProfile: Profile = { signInEmail: "", fullName: "", contactEmail: "", phone: "" };

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-av-muted">
      {label}
      <input
        name={name}
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded border border-av-border bg-av-card px-3 py-2.5 text-[14px] text-av-text outline-none transition-colors placeholder:text-av-muted/60 focus:border-av-blue"
      />
      {hint ? <span className="text-[12px] text-av-muted/80">{hint}</span> : null}
    </label>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) {
          setSignedOut(true);
          return;
        }
        if (!response.ok) throw new Error(data.error ?? "Could not load profile.");
        setProfile({ ...emptyProfile, ...data });
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not load profile."))
      .finally(() => setLoading(false));
  }, []);

  function update(key: keyof Profile, value: string) {
    setProfile(current => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: profile.fullName,
          contactEmail: profile.contactEmail,
          phone: profile.phone,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save profile.");
      setProfile({ ...emptyProfile, ...data });
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonProfileForm />;

  if (signedOut) {
    return (
      <main className="mx-auto flex w-full max-w-210 flex-col gap-4 px-6 py-8">
        <h1 className="m-0 text-[26px] font-semibold text-av-text">Profile</h1>
        <p className="m-0 text-[14px] text-av-muted">
          Sign in to edit the details the agent books with.{" "}
          <Link href="/login" className="text-av-blue">
            Sign in →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-210 flex-col gap-6 px-6 py-8">
      <header>
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.12em] text-av-blue">Your details</p>
        <h1 className="m-0 mt-2 text-[26px] font-semibold text-av-text">Profile</h1>
        <p className="m-0 mt-1 max-w-155 text-[14px] text-av-muted">
          The agent books with exactly these details — so it never asks you for a name or an email at booking time.
        </p>
      </header>

      <section className="rounded border border-av-border bg-av-card p-6">
        <div className="flex items-center gap-3 border-b border-av-border pb-4">
          <UserIcon size={20} className="text-av-blue" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold text-av-text">Contact</h2>
            <p className="m-0 mt-0.5 text-[12px] text-av-muted">Used as the passenger on every booking.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="fullName"
            value={profile.fullName}
            onChange={value => update("fullName", value)}
            placeholder="As shown on your passport"
          />
          <Field
            label="Email"
            name="contactEmail"
            type="email"
            value={profile.contactEmail}
            onChange={value => update("contactEmail", value)}
            placeholder={profile.signInEmail}
            hint={`Leave blank to use your sign-in address, ${profile.signInEmail}.`}
          />
          <Field
            label="Phone number"
            name="phone"
            type="tel"
            value={profile.phone}
            onChange={value => update("phone", value)}
            placeholder="+1 555 000 0000"
          />
        </div>
      </section>

      <div className="flex items-center justify-end gap-4">
        {message && <p className="m-0 text-[13px] text-av-muted">{message}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-av-blue px-5 py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </main>
  );
}
