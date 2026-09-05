import { z } from "zod";

export const BookingRequest = z.object({
  searchResultId: z.string(),
  passengerName: z.string(),
  passengerEmail: z.string().email(),
  paymentProof: z.string(),
});
export type BookingRequest = z.infer<typeof BookingRequest>;

export const BookingResponse = z.object({
  bookingId: z.string(),
  status: z.enum(["confirmed", "failed", "not_implemented"]),
  confirmationCode: z.string().optional(),
});
export type BookingResponse = z.infer<typeof BookingResponse>;
