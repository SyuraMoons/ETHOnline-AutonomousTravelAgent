import express from "express";
import { wellKnownRouter } from "./routes/wellKnown.js";
import { flightsRouter } from "./routes/flights.js";
import { bookingRouter } from "./routes/booking.js";
import { healthRouter } from "./routes/health.js";
import { loadCachedFlights } from "./lib/flightsCache.js";

const app = express();
app.use(express.json());

app.use(wellKnownRouter);
app.use(flightsRouter);
app.use(bookingRouter);
app.use(healthRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
  const cachedCount = loadCachedFlights().length;
  console.log(`[supplier] listening on :${PORT} (phase 0-scaffold, ${cachedCount} cached flights)`);
});
