import express from "express";
import { wellKnownRouter } from "./routes/wellKnown.js";
import { flightsRouter } from "./routes/flights.js";
import { staysRouter } from "./routes/stays.js";
import { activitiesRouter } from "./routes/activities.js";
import { bookingRouter } from "./routes/booking.js";
import { healthRouter } from "./routes/health.js";
import { loadCachedFlights } from "./lib/flightsCache.js";
import { loadCachedStays } from "./lib/staysCache.js";
import { loadCachedActivities } from "./lib/activitiesCache.js";
import { getHTTPResourceServer } from "./services/x402/server.js";
import { PORT, PAY_TO } from "./config.js";

const app = express();
app.use(express.json());

app.use(wellKnownRouter);
app.use(flightsRouter);
app.use(staysRouter);
app.use(activitiesRouter);
app.use(bookingRouter);
app.use(healthRouter);

async function main() {
  // Fail fast: validate facilitator support for every registered route
  // before accepting traffic, rather than discovering a misconfiguration on
  // the first paid request.
  await getHTTPResourceServer();

  app.listen(PORT, () => {
    // Loading all three here also fails fast on a missing cache, rather than
    // on the first paid request for whichever domain was never generated.
    const counts = [
      `${loadCachedFlights().length} flights`,
      `${loadCachedStays().length} stays`,
      `${loadCachedActivities().length} activities`,
    ].join(", ");
    console.log(
      `[supplier] listening on :${PORT} (payTo=${PAY_TO}; ${counts})`,
    );
  });
}

main().catch((error) => {
  console.error(
    "[supplier] startup failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
