import { create } from "zustand";

/**
 * AutoVoyage planner state — separate from useGlobalState (./store.ts),
 * which holds wallet/network state for the whole Scaffold-HBAR app.
 *
 * TODO Phase 1: add Plan / Mandate / AuditEvent state and actions once the
 * planner (POST /api/plan) and audit feed (GET /api/audit/[planId]) exist.
 */
interface PlanStoreState {}

export const usePlanStore = create<PlanStoreState>(() => ({}));
