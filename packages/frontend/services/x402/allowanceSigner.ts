import { AccountId, Client, Hbar, PrivateKey, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import type { PaymentRequirements } from "@x402/core/types";
import type { ClientHederaSigner } from "@x402/hedera";
import { isHbarAsset, isSupportedHederaNetwork } from "@x402/hedera";

/**
 * x402 client signer that spends from the USER's account under a HIP-336 HBAR allowance,
 * signed by the agent's server-held key. The user grants the allowance once (one HashPack
 * signature) and never signs a payment again.
 *
 * Differs from the two sibling signers in exactly one way that matters — the debit is an
 * *approved* transfer against someone else's account:
 *
 *   walletSigner.ts        debit = the connected wallet,  signed by the wallet  (user signs each time)
 *   createClientHederaSigner  debit = the agent's own account, signed by the agent (treasury)
 *   this                   debit = the USER's account,     signed by the AGENT   (allowance)
 *
 * Two hard network constraints, both established on testnet by scripts/allowance-probe*.ts:
 *
 *  1. The transaction id MUST belong to the SPENDER (the agent). With a third party — the
 *     facilitator — owning it, Hedera rejects the transfer at precheck with
 *     SPENDER_DOES_NOT_HAVE_ALLOWANCE. So the facilitator has to advertise the agent as
 *     `extra.feePayer` (FACILITATOR_ADVERTISED_FEE_PAYER), and the agent pays the node fee.
 *  2. A different account may still SUBMIT the transaction, which is what lets the facilitator
 *     keep its verify-and-settle role. Its co-signature is accepted but unnecessary.
 *
 * The allowance is the hard on-chain ceiling; the mandate is the soft app-level one. Both
 * apply — an over-allowance transfer fails with AMOUNT_EXCEEDS_ALLOWANCE even if a mandate bug
 * let it through.
 */

export type AllowanceSignerConfig = {
  /** The account the HBAR actually comes from — the user who granted the allowance. */
  ownerAccountId: string;
  /** The agent's account: allowance spender, transaction-id owner, and signer. */
  spenderAccountId: string;
  spenderPrivateKey: PrivateKey;
};

export function createAllowanceHederaSigner(config: AllowanceSignerConfig): ClientHederaSigner {
  const { ownerAccountId, spenderAccountId, spenderPrivateKey } = config;

  return {
    // The x402 client reports this as the paying account. It is the OWNER, not the spender:
    // the owner is whose balance drops, and whose account the facilitator preflights and
    // reports back as `settlement.payer`.
    accountId: ownerAccountId,

    createPartiallySignedTransferTransaction: async (requirements: PaymentRequirements) => {
      if (!isSupportedHederaNetwork(requirements.network)) {
        throw new Error(`Unsupported Hedera network: ${requirements.network}`);
      }
      if (!isHbarAsset(requirements.asset)) {
        // An allowance for a fungible token needs approveTokenAllowance and
        // addApprovedTokenTransfer; this build only ever prices in HBAR.
        throw new Error(`Allowance payments support native HBAR only, got asset ${requirements.asset}`);
      }

      const feePayer = requirements.extra?.feePayer;
      if (typeof feePayer !== "string") {
        throw new Error("feePayer is required in paymentRequirements.extra");
      }
      // Constraint 1 above. Failing here with a clear message beats an opaque
      // SPENDER_DOES_NOT_HAVE_ALLOWANCE precheck from the network, or a
      // fee_payer_mismatch from the facilitator.
      if (feePayer !== spenderAccountId) {
        throw new Error(
          `Allowance payments require the facilitator to advertise the agent (${spenderAccountId}) as feePayer, ` +
            `but it advertised ${feePayer}. Set FACILITATOR_ADVERTISED_FEE_PAYER=${spenderAccountId}.`,
        );
      }

      const amount = BigInt(requirements.amount);
      if (amount <= 0n) {
        throw new Error("amount must be greater than zero");
      }

      const owner = AccountId.fromString(ownerAccountId);
      const payTo = AccountId.fromString(requirements.payTo);

      const tx = new TransferTransaction()
        .addApprovedHbarTransfer(owner, Hbar.fromTinybars((-amount).toString()))
        .addHbarTransfer(payTo, Hbar.fromTinybars(amount.toString()))
        .setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)));

      // freezeWith needs node account ids; a network-only client supplies them without
      // an operator, since this signer never submits — the facilitator does.
      const client = clientForNetwork(requirements.network);
      const signed = await tx.freezeWith(client).sign(spenderPrivateKey);

      return Buffer.from(signed.toBytes()).toString("base64");
    },
  };
}

/**
 * One client per network for the process lifetime.
 *
 * A Client opens gRPC channels that must be closed, and nothing here ever closes one — a
 * fresh client per payment leaks a connection per search and keeps Node from exiting. Since
 * this client is only used to supply node account ids to freezeWith(), a single shared
 * instance is both correct and cheap.
 */
const clients = new Map<string, Client>();

function clientForNetwork(network: string): Client {
  const cached = clients.get(network);
  if (cached) return cached;

  const name = network.split(":")[1];
  let client: Client;
  switch (name) {
    case "mainnet":
      client = Client.forMainnet();
      break;
    case "testnet":
      client = Client.forTestnet();
      break;
    case "previewnet":
      client = Client.forPreviewnet();
      break;
    default:
      throw new Error(`Unsupported Hedera network: ${network}`);
  }
  clients.set(network, client);
  return client;
}
