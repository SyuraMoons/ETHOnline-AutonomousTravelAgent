import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privateKeyB64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("SUPPLIER_SIGNING_KEY (put this in packages/supplier/.env):");
console.log(privateKeyB64);
console.log();
console.log("Corresponding public key (for verifying BookingResponse.signature — also served at GET /.well-known/x402):");
console.log(publicKeyB64);
