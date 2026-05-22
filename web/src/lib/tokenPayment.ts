import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

import { getPlatformFeeWallet } from "./platformConfig";

type TokenPaymentParams = {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey" | "sendTransaction">;
  mintAddress: string;
  amount: number;
  creatorAddress: string;
  platformAddress?: string;
};

export async function handleTokenPayment({
  connection,
  wallet,
  mintAddress,
  amount,
  creatorAddress,
  platformAddress,
}: TokenPaymentParams): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect wallet first");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid token amount.");
  }

  const feeWallet = platformAddress ?? (await getPlatformFeeWallet());
  const mint = new PublicKey(mintAddress);
  const creator = new PublicKey(creatorAddress);
  const buyer = wallet.publicKey;
  const platform = new PublicKey(feeWallet);

  const totalAmount = BigInt(Math.round(amount));
  const feeAmount = totalAmount / 100n; // 1% platform fee
  const creatorAmount = totalAmount - feeAmount;

  const buyerAta = await getAssociatedTokenAddress(mint, buyer);
  const creatorAta = await getAssociatedTokenAddress(mint, creator);
  const platformAta = await getAssociatedTokenAddress(mint, platform);

  const tx = new Transaction();
  const creatorAtaInfo = await connection.getAccountInfo(creatorAta, "confirmed");
  if (!creatorAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(buyer, creatorAta, creator, mint));
  }

  const platformAtaInfo = platformAta.equals(creatorAta)
    ? creatorAtaInfo
    : await connection.getAccountInfo(platformAta, "confirmed");
  if (!platformAtaInfo && !platformAta.equals(creatorAta)) {
    tx.add(createAssociatedTokenAccountInstruction(buyer, platformAta, platform, mint));
  }

  const buyerAtaInfo = await connection.getAccountInfo(buyerAta, "confirmed");
  if (!buyerAtaInfo) {
    throw new Error("Your wallet does not have a token account for this mint.");
  }

  // Split payment: 99% -> creator, 1% -> platform.
  if (creatorAmount > 0n) {
    tx.add(createTransferInstruction(buyerAta, creatorAta, buyer, creatorAmount));
  }
  if (feeAmount > 0n) {
    tx.add(createTransferInstruction(buyerAta, platformAta, buyer, feeAmount));
  }

  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = buyer;

  const signature = await wallet.sendTransaction(tx, connection, { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}
