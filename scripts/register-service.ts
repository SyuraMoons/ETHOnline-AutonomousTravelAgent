// Publishes a ServiceRegistered message to the HCS registry topic so agents
// can discover this supplier via GET /api/registry (apps/web) without hitting
// its /.well-known/x402 endpoint directly.
//
// TODO: implement HCS submit — Phase 1

async function main(): Promise<void> {
  const topicId = process.env.HCS_REGISTRY_TOPIC_ID;
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!topicId || !operatorId || !operatorKey) {
    console.error(
      "[register-service] missing HCS_REGISTRY_TOPIC_ID / HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY",
    );
    process.exit(1);
  }

  console.log("TODO: implement HCS submit — Phase 1");
}

main();
