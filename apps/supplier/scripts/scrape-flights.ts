// Runs as a separate, one-off/scheduled job — never on-demand from the
// request path. Writes its output to /data/cache/flights.json at the repo
// root, which apps/supplier reads at request time.
//
// TODO: implement scraper — Phase 1

async function main(): Promise<void> {
  console.log("[scrape-flights] not implemented yet — Phase 1");
}

main();
