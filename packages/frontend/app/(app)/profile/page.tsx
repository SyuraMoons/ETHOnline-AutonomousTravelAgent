"use client";

// Profile page
import { useEffect, useState } from "react";
import { MapPinIcon, UserIcon, WalletIcon } from "~~/components/autovoyage/ui/icons";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

type Profile = {
  email: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
  homeAddress: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };
  walletAccountId: string;
  walletNetwork: string;
};

const emptyProfile: Profile = {
  email: "",
  fullName: "",
  phone: "",
  dateOfBirth: "",
  nationality: "",
  passportNumber: "",
  passportExpiry: "",
  homeAddress: {},
  walletAccountId: "",
  walletNetwork: "hedera:testnet",
};

function Field({ label, name, value, onChange, type = "text", placeholder }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
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
    </label>
  );
}

export default function ProfilePage() {
  const { accountId, isConnected } = useHederaWalletConnect();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load profile.");
        setProfile({ ...emptyProfile, ...data, homeAddress: { ...emptyProfile.homeAddress, ...(data.homeAddress ?? {}) } });
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not load profile."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isConnected && accountId) setProfile(current => ({ ...current, walletAccountId: accountId }));
  }, [accountId, isConnected]);

  function update(key: keyof Profile, value: string) {
    setProfile(current => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function updateAddress(key: keyof Profile["homeAddress"], value: string) {
    setProfile(current => ({ ...current, homeAddress: { ...current.homeAddress, [key]: value } }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save profile.");
      setProfile({ ...emptyProfile, ...data, homeAddress: { ...emptyProfile.homeAddress, ...(data.homeAddress ?? {}) } });
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-[14px] text-av-muted">Loading profile…</div>;

  return (
    <main className="mx-auto flex w-full max-w-210 flex-col gap-6 px-6 py-8">
      <header>
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.12em] text-av-blue">Your details</p>
        <h1 className="m-0 mt-2 text-[26px] font-semibold text-av-text">Profile</h1>
        <p className="m-0 mt-1 max-w-155 text-[14px] text-av-muted">
          Keep the information the agent needs for bookings in one place. Your wallet connection is public account metadata; never enter a private key here.
        </p>
      </header>

      <section className="rounded border border-av-border bg-av-card p-6">
        <div className="flex items-center gap-3 border-b border-av-border pb-4">
          <UserIcon size={20} className="text-av-blue" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold text-av-text">Contact and identity</h2>
            <p className="m-0 mt-0.5 text-[12px] text-av-muted">Used to personalize plans and complete passenger details.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Sign-in email" name="email" value={profile.email} onChange={() => {}} type="email" />
          <Field label="Full legal name" name="fullName" value={profile.fullName} onChange={value => update("fullName", value)} placeholder="As shown on your passport" />
          <Field label="Phone number" name="phone" value={profile.phone} onChange={value => update("phone", value)} placeholder="+1 555 000 0000" />
          <Field label="Nationality" name="nationality" value={profile.nationality} onChange={value => update("nationality", value)} placeholder="Country of citizenship" />
          <Field label="Date of birth" name="dateOfBirth" value={profile.dateOfBirth} onChange={value => update("dateOfBirth", value)} type="date" />
          <Field label="Passport number" name="passportNumber" value={profile.passportNumber} onChange={value => update("passportNumber", value)} />
          <Field label="Passport expiry" name="passportExpiry" value={profile.passportExpiry} onChange={value => update("passportExpiry", value)} type="date" />
        </div>
      </section>

      <section className="rounded border border-av-border bg-av-card p-6">
        <div className="flex items-center gap-3 border-b border-av-border pb-4">
          <MapPinIcon size={20} className="text-av-blue" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold text-av-text">Home address</h2>
            <p className="m-0 mt-0.5 text-[12px] text-av-muted">Used when a booking or document requires your residential address.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Address line 1" name="line1" value={profile.homeAddress.line1 ?? ""} onChange={value => updateAddress("line1", value)} /></div>
          <div className="sm:col-span-2"><Field label="Address line 2" name="line2" value={profile.homeAddress.line2 ?? ""} onChange={value => updateAddress("line2", value)} placeholder="Apartment, suite, etc. (optional)" /></div>
          <Field label="City" name="city" value={profile.homeAddress.city ?? ""} onChange={value => updateAddress("city", value)} />
          <Field label="State / region" name="state" value={profile.homeAddress.state ?? ""} onChange={value => updateAddress("state", value)} />
          <Field label="Postal code" name="postalCode" value={profile.homeAddress.postalCode ?? ""} onChange={value => updateAddress("postalCode", value)} />
          <Field label="Country" name="country" value={profile.homeAddress.country ?? ""} onChange={value => updateAddress("country", value)} />
        </div>
      </section>

      <section className="rounded border border-av-border bg-av-card p-6">
        <div className="flex items-center gap-3 border-b border-av-border pb-4">
          <WalletIcon size={20} className="text-av-blue" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold text-av-text">Wallet</h2>
            <p className="m-0 mt-0.5 text-[12px] text-av-muted">Only your public Hedera account ID is stored.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Hedera account ID" name="walletAccountId" value={profile.walletAccountId} onChange={value => update("walletAccountId", value)} placeholder="0.0.123456" />
          <Field label="Network" name="walletNetwork" value={profile.walletNetwork} onChange={value => update("walletNetwork", value)} />
        </div>
        {isConnected && <p className="m-0 mt-3 text-[12px] text-av-green">Connected wallet detected and ready to save.</p>}
      </section>

      <div className="flex items-center justify-end gap-4">
        {message && <p className="m-0 text-[13px] text-av-muted">{message}</p>}
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded bg-av-blue px-5 py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </main>
  );
}