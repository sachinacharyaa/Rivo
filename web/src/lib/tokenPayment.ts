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

type TokenPaymentParams = {
  connection: Connection;
  wallet: Pick<WalletContextState, "publicKey" | "sendTransaction">;
  mintAddress: string;
  amount: number;
  creatorAddress: string;
};

export async function handleTokenPayment({
  connection,
  wallet,
  mintAddress,
  amount,
  creatorAddress,
}: TokenPaymentParams): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect wallet first");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid token amount.");
  }

  const mint = new PublicKey(mintAddress);
  const creator = new PublicKey(creatorAddress);
  const buyer = wallet.publicKey;
  const buyerAta = await getAssociatedTokenAddress(mint, buyer);
  const creatorAta = await getAssociatedTokenAddress(mint, creator);

  const tx = new Transaction();
  const creatorAtaInfo = await connection.getAccountInfo(creatorAta, "confirmed");
  if (!creatorAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(buyer, creatorAta, creator, mint));
  }

  const buyerAtaInfo = await connection.getAccountInfo(buyerAta, "confirmed");
  if (!buyerAtaInfo) {
    throw new Error("Your wallet does not have a PUSD token account.");
  }

  tx.add(createTransferInstruction(buyerAta, creatorAta, buyer, BigInt(amount)));
  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = buyer;

  const signature = await wallet.sendTransaction(tx, connection, { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}
