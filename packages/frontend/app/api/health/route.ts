import { NextResponse } from "next/server";

type SupplierHealth = {
  ok: boolean;
  payTo: string;
  network: string;
  facilitatorUrl: string;
  facilitatorReachable: boolean;
  inventoryRows: number;
};

export async function GET() {
  const supplierBaseUrl = process.env.SUPPLIER_BASE_URL ?? "http://localhost:4100";
  const agentConfigured = Boolean(process.env.AGENT_ACCOUNT_ID && process.env.AGENT_PRIVATE_KEY);

  let supplier: SupplierHealth | { reachable: false } = { reachable: false };
  try {
    const res = await fetch(`${supplierBaseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) supplier = (await res.json()) as SupplierHealth;
  } catch {
    // supplier unreachable — reported as-is below
  }

  return NextResponse.json({
    ok: agentConfigured && "ok" in supplier && supplier.ok,
    agentConfigured,
    supplierBaseUrl,
    supplier,
  });
}
