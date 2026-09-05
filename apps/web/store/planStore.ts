import { create } from "zustand";

// TODO Phase 1: add Plan / Mandate / AuditEvent state and actions once the
// planner (POST /api/plan) and audit feed (GET /api/audit/[planId]) exist.
interface PlanStoreState {}

export const usePlanStore = create<PlanStoreState>(() => ({}));
