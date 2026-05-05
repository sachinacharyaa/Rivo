import { PublicKey, SystemProgram } from "@solana/web3.js";

const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Verify a confirmed transaction contains split system transfers:
 * buyer -> creator and buyer -> platform for expected amounts.
 */
export async function verifySolTransfer(connection, signature, buyerWallet, creatorWallet, platformWallet, expectedCreatorLamports, expectedFeeLamports) {
  const buyer = new PublicKey(buyerWallet);
  const creator = new PublicKey(creatorWallet);
  const platform = new PublicKey(platformWallet);
  const wantCreator = BigInt(expectedCreatorLamports);
  const wantFee = BigInt(expectedFeeLamports);

  const parsed = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!parsed) return { ok: false, reason: "Transaction not found" };
  if (parsed.meta?.err) return { ok: false, reason: "Transaction failed on-chain" };

  const candidates = [];
  const { message } = parsed.transaction;
  const outer = "instructions" in message ? message.instructions : [];
  for (const ix of outer) candidates.push(ix);
  if (parsed.meta?.innerInstructions) {
    for (const group of parsed.meta.innerInstructions) {
      for (const ix of group.instructions) candidates.push(ix);
    }
  }

  const parsedMatch = verifyTransfersFromParsed(candidates, buyer, creator, platform, wantCreator, wantFee);
  if (parsedMatch.ok) return { ok: true };

  const raw = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (raw?.meta && raw.transaction) {
    const balanceMatch = verifyByBalanceDelta(raw, buyer, creator, platform, wantCreator, wantFee);
    if (balanceMatch.ok) return { ok: true };
    return {
      ok: false,
      reason:
        `Split transfer mismatch. Expected creator=${wantCreator.toString()} lamports, ` +
        `platform=${wantFee.toString()} lamports; parsed creator=${parsedMatch.toCreator.toString()}, ` +
        `parsed platform=${parsedMatch.toPlatform.toString()}, balance creator=${balanceMatch.toCreator.toString()}, ` +
        `balance platform=${balanceMatch.toPlatform.toString()}.`,
    };
  }

  return {
    ok: false,
    reason:
      `No valid split SOL transfer found. Expected creator=${wantCreator.toString()} lamports, ` +
      `platform=${wantFee.toString()} lamports; parsed creator=${parsedMatch.toCreator.toString()}, ` +
      `parsed platform=${parsedMatch.toPlatform.toString()}.`,
  };
}

export async function verifySplTransfer(connection, signature, mintAddress, destinationAtaAddress, expectedAmount) {
  const parsed = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!parsed) return { ok: false, reason: "Transaction not found" };
  if (parsed.meta?.err) return { ok: false, reason: "Transaction failed on-chain" };

  const destinationAta = destinationAtaAddress;
  const mint = mintAddress;
  const expected = BigInt(expectedAmount);

  const keys = getAccountKeysForTx({
    transaction: parsed.transaction,
    meta: parsed.meta,
  });
  let destinationIndex = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toBase58() === destinationAta) {
      destinationIndex = i;
      break;
    }
  }
  if (destinationIndex < 0) return { ok: false, reason: "Destination token account not part of transaction" };

  const pre = tokenBalanceAmountForIndex(parsed.meta?.preTokenBalances, destinationIndex, mint);
  const post = tokenBalanceAmountForIndex(parsed.meta?.postTokenBalances, destinationIndex, mint);
  const delta = post - pre;
  if (delta !== expected) {
    return {
      ok: false,
      reason: `Destination token delta mismatch. expected=${expected.toString()} got=${delta.toString()}`,
    };
  }

  const hasTransferIx = hasSplTransferInstruction(parsed, mint, destinationAta, expected);
  if (!hasTransferIx) return { ok: false, reason: "No matching SPL transfer instruction found" };

  return { ok: true };
}

/**
 * Verify a confirmed transaction contains a split SPL-token payment:
 * buyer ATA -> creator ATA (expectedCreatorAmount)
 * buyer ATA -> platform ATA (expectedPlatformAmount)
 */
export async function verifySplSplitTransfer(
  connection,
  signature,
  mintAddress,
  buyerAtaAddress,
  creatorAtaAddress,
  expectedCreatorAmount,
  platformAtaAddress,
  expectedPlatformAmount,
) {
  const parsed = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!parsed) return { ok: false, reason: "Transaction not found" };
  if (parsed.meta?.err) return { ok: false, reason: "Transaction failed on-chain" };

  const expectedCreator = BigInt(expectedCreatorAmount);
  const expectedPlatform = BigInt(expectedPlatformAmount);

  const mint = mintAddress;
  const keys = getAccountKeysForTx({
    transaction: parsed.transaction,
    meta: parsed.meta,
  });

  const findIndex = (ata) => {
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].toBase58() === ata) return i;
    }
    return -1;
  };

  const creatorIndex = findIndex(creatorAtaAddress);
  const platformIndex = platformAtaAddress === creatorAtaAddress ? creatorIndex : findIndex(platformAtaAddress);
  if (creatorIndex < 0 || platformIndex < 0) return { ok: false, reason: "Creator/platform token accounts not part of transaction" };

  const preCreator = tokenBalanceAmountForIndex(parsed.meta?.preTokenBalances, creatorIndex, mint);
  const postCreator = tokenBalanceAmountForIndex(parsed.meta?.postTokenBalances, creatorIndex, mint);
  const deltaCreator = postCreator - preCreator;

  if (creatorAtaAddress === platformAtaAddress) {
    const expectedTotal = expectedCreator + expectedPlatform;
    if (deltaCreator !== expectedTotal) {
      return {
        ok: false,
        reason: `Token delta mismatch for shared destination. expected=${expectedTotal.toString()} got=${deltaCreator.toString()}`,
      };
    }

    const sentTotal = sumSplTransferAmounts(parsed, mint, buyerAtaAddress, creatorAtaAddress);
    if (sentTotal !== expectedTotal) {
      return {
        ok: false,
        reason: `No matching SPL split transfers. expectedTotal=${expectedTotal.toString()} sentTotal=${sentTotal.toString()}`,
      };
    }

    return { ok: true };
  }

  const prePlatform = tokenBalanceAmountForIndex(parsed.meta?.preTokenBalances, platformIndex, mint);
  const postPlatform = tokenBalanceAmountForIndex(parsed.meta?.postTokenBalances, platformIndex, mint);
  const deltaPlatform = postPlatform - prePlatform;

  if (deltaCreator !== expectedCreator || deltaPlatform !== expectedPlatform) {
    return {
      ok: false,
      reason:
        `SPL split delta mismatch. ` +
        `expectedCreator=${expectedCreator.toString()} gotCreator=${deltaCreator.toString()}; ` +
        `expectedPlatform=${expectedPlatform.toString()} gotPlatform=${deltaPlatform.toString()}.`,
    };
  }

  const creatorSent = sumSplTransferAmounts(parsed, mint, buyerAtaAddress, creatorAtaAddress);
  const platformSent = sumSplTransferAmounts(parsed, mint, buyerAtaAddress, platformAtaAddress);

  if (creatorSent !== expectedCreator || platformSent !== expectedPlatform) {
    return {
      ok: false,
      reason:
        `SPL split instruction mismatch. ` +
        `expectedCreator=${expectedCreator.toString()} sentCreator=${creatorSent.toString()}; ` +
        `expectedPlatform=${expectedPlatform.toString()} sentPlatform=${platformSent.toString()}.`,
    };
  }

  return { ok: true };
}

function programIdString(ix) {
  const p = ix.programId;
  if (typeof p === "string") return p;
  if (p && typeof p.toBase58 === "function") return p.toBase58();
  return "";
}

function transferAmount(ix, buyer, target) {
  if (programIdString(ix) !== SYSTEM_PROGRAM_ID) return 0n;
  const parsed = ix.parsed;
  if (!parsed || parsed.type !== "transfer") return 0n;
  const { source, destination: infoDestination, lamports } = parsed.info;
  if (!source || !infoDestination || lamports === undefined) return 0n;
  try {
    const src = new PublicKey(source);
    const dst = new PublicKey(infoDestination);
    if (!src.equals(buyer) || !dst.equals(target)) return 0n;
    return BigInt(lamports);
  } catch {
    return 0n;
  }
}

function verifyTransfersFromParsed(candidates, buyer, creator, platform, wantCreator, wantFee) {
  let toCreator = 0n;
  let toPlatform = 0n;
  for (const ix of candidates) {
    toCreator += transferAmount(ix, buyer, creator);
    toPlatform += transferAmount(ix, buyer, platform);
  }

  if (creator.equals(platform)) {
    return {
      ok: toCreator === wantCreator + wantFee,
      toCreator,
      toPlatform,
    };
  }

  return {
    ok: toCreator === wantCreator && toPlatform === wantFee,
    toCreator,
    toPlatform,
  };
}

function getAccountKeysForTx(tx) {
  const msg = tx.transaction.message;

  const toPublicKey = (key) => {
    if (key instanceof PublicKey) return key;
    if (typeof key === "string") return new PublicKey(key);
    if (key && typeof key.toBase58 === "function") return new PublicKey(key.toBase58());
    if (key && typeof key.pubkey === "string") return new PublicKey(key.pubkey);
    if (key && key.pubkey && typeof key.pubkey.toBase58 === "function") return new PublicKey(key.pubkey.toBase58());
    return null;
  };

  // Legacy/parsing responses may expose only `accountKeys` (sometimes as objects with `pubkey`).
  if (Array.isArray(msg.accountKeys) && msg.accountKeys.length > 0) {
    return msg.accountKeys
      .map(toPublicKey)
      .filter((k) => k instanceof PublicKey);
  }

  // Versioned responses expose `staticAccountKeys` + loaded addresses.
  const out = Array.isArray(msg.staticAccountKeys)
    ? msg.staticAccountKeys
        .map(toPublicKey)
        .filter((k) => k instanceof PublicKey)
    : [];
  const loaded = tx.meta?.loadedAddresses;
  if (loaded?.writable?.length) {
    for (const w of loaded.writable) out.push(new PublicKey(w));
  }
  if (loaded?.readonly?.length) {
    for (const r of loaded.readonly) out.push(new PublicKey(r));
  }
  return out;
}

function verifyByBalanceDelta(tx, buyer, creator, platform, wantCreatorLamports, wantFeeLamports) {
  const keys = getAccountKeysForTx(tx);
  const meta = tx.meta;
  if (!meta?.preBalances || !meta?.postBalances) {
    return { ok: false, toCreator: 0n, toPlatform: 0n };
  }

  let buyerIdx = -1;
  let creatorIdx = -1;
  let platformIdx = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].equals(buyer)) buyerIdx = i;
    if (keys[i].equals(creator)) creatorIdx = i;
    if (keys[i].equals(platform)) platformIdx = i;
  }
  if (buyerIdx < 0 || creatorIdx < 0 || platformIdx < 0) {
    return { ok: false, toCreator: 0n, toPlatform: 0n };
  }

  const preB = meta.preBalances[buyerIdx];
  const postB = meta.postBalances[buyerIdx];
  const preC = meta.preBalances[creatorIdx];
  const postC = meta.postBalances[creatorIdx];
  const preP = meta.preBalances[platformIdx];
  const postP = meta.postBalances[platformIdx];

  const toCreator = BigInt(postC) - BigInt(preC);
  const toPlatform = BigInt(postP) - BigInt(preP);
  const fromBuyer = BigInt(preB) - BigInt(postB);
  const total = wantCreatorLamports + wantFeeLamports;

  if (creator.equals(platform)) {
    return {
      ok: toCreator === total && fromBuyer >= total,
      toCreator,
      toPlatform,
    };
  }

  return {
    ok:
      toCreator === wantCreatorLamports &&
      toPlatform === wantFeeLamports &&
      fromBuyer >= total,
    toCreator,
    toPlatform,
  };
}

function tokenBalanceAmountForIndex(balances, accountIndex, mint) {
  if (!balances?.length) return 0n;
  const match = balances.find((b) => b.accountIndex === accountIndex && b.mint === mint);
  if (!match?.uiTokenAmount?.amount) return 0n;
  return BigInt(match.uiTokenAmount.amount);
}

function hasSplTransferInstruction(parsedTx, mint, destinationAta, expectedAmount) {
  const candidates = [];
  const { message } = parsedTx.transaction;
  const outer = "instructions" in message ? message.instructions : [];
  for (const ix of outer) candidates.push(ix);
  if (parsedTx.meta?.innerInstructions) {
    for (const group of parsedTx.meta.innerInstructions) {
      for (const ix of group.instructions) candidates.push(ix);
    }
  }

  const expected = BigInt(expectedAmount);
  for (const ix of candidates) {
    if (programIdString(ix) !== TOKEN_PROGRAM_ID) continue;
    const parsed = ix.parsed;
    if (!parsed || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) continue;
    const info = parsed.info || {};
    const dest = info.destination || info.account;
    if (dest !== destinationAta) continue;
    if (parsed.type === "transferChecked" && info.mint && info.mint !== mint) continue;
    const amount = info.tokenAmount?.amount || info.amount;
    if (!amount) continue;
    if (BigInt(amount) === expected) return true;
  }

  return false;
}

function sumSplTransferAmounts(parsedTx, mint, sourceAta, destinationAta) {
  const candidates = [];
  const { message } = parsedTx.transaction;
  const outer = "instructions" in message ? message.instructions : [];
  for (const ix of outer) candidates.push(ix);
  if (parsedTx.meta?.innerInstructions) {
    for (const group of parsedTx.meta.innerInstructions) {
      for (const ix of group.instructions) candidates.push(ix);
    }
  }

  let total = 0n;
  for (const ix of candidates) {
    if (programIdString(ix) !== TOKEN_PROGRAM_ID) continue;
    const parsed = ix.parsed;
    if (!parsed || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) continue;
    const info = parsed.info || {};
    const src = info.source || "";
    const dest = info.destination || info.account || "";
    if (src !== sourceAta || dest !== destinationAta) continue;
    if (parsed.type === "transferChecked" && info.mint && info.mint !== mint) continue;
    const amount = info.tokenAmount?.amount || info.amount;
    if (!amount) continue;
    total += BigInt(amount);
  }

  return total;
}
