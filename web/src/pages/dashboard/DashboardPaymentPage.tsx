import { useEffect, useState } from "react";
import axios from "axios";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "../../lib/api";

type Mode = "current" | "custom";

export function DashboardPaymentPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [mode, setMode] = useState<Mode>("current");
  const [customWallet, setCustomWallet] = useState("");
  const [savedWallet, setSavedWallet] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const isValidWallet = (value: string) => {
    try {
      return Boolean(new PublicKey(value));
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!wallet) return;
    let active = true;
    api
      .get<{ payoutWallet?: string }>(`/creators/${wallet}/payout`)
      .then((res) => {
        if (!active) return;
        const payout = res.data?.payoutWallet || wallet;
        setSavedWallet(payout);
        if (payout && payout !== wallet) {
          setMode("custom");
          setCustomWallet(payout);
        } else {
          setMode("current");
          setCustomWallet("");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [wallet]);

  const save = async () => {
    setError("");
    setNotice("");
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    const payoutWallet = mode === "current" ? wallet : customWallet.trim();
    if (!payoutWallet || !isValidWallet(payoutWallet)) {
      setError("Enter a valid wallet address.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/creators/${wallet}/payout`, { payoutWallet });
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("Rivo_payout_wallet", payoutWallet);
      }
      setSavedWallet(payoutWallet);
      setNotice("Payout wallet saved.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)
          ?.message;
        if (!err.response) {
          setError(
            "API is unreachable. Check your API deployment and VITE_API_URL configuration.",
          );
        } else {
          setError(message || "Could not save payout wallet. Try again.");
        }
      } else {
        setError("Could not save payout wallet. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gum-page gum-page--wide">
      <div className="gum-products-header">
        <div>
          <h1 className="gum-page__h1">Payments</h1>
          <p className="gum-page__lead">
            Choose where your SOL sales are paid out. Buyers will pay the saved
            payout wallet, plus a 1% Rivo fee.
          </p>
        </div>
      </div>

      <div className="gum-panel">
        <div className="gum-panel__head">
          <div>
            <div className="gum-panel__title">Payout wallet</div>
            <div className="gum-panel__sub">
              You can use your connected wallet or assign a different one.
            </div>
          </div>
          <div className="gum-panel__pill">
            Current: {savedWallet || wallet}
          </div>
        </div>

        <div className="gum-field">
          <label className="gum-label">Connected wallet</label>
          <div className="gum-wallet-pill">{wallet}</div>
        </div>

        <div className="gum-radio-row">
          <label className="gum-radio">
            <input
              type="radio"
              name="payout-mode"
              checked={mode === "current"}
              onChange={() => setMode("current")}
            />
            Use connected wallet
          </label>
          <label className="gum-radio">
            <input
              type="radio"
              name="payout-mode"
              checked={mode === "custom"}
              onChange={() => setMode("custom")}
            />
            Use a different wallet
          </label>
        </div>

        <div className="gum-field">
          <label className="gum-label">Custom payout wallet</label>
          <input
            className="gum-input"
            placeholder="Paste a Solana wallet address"
            value={customWallet}
            onChange={(e) => setCustomWallet(e.target.value)}
            disabled={mode !== "custom"}
          />
        </div>

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        <div className="gum-panel__actions">
          <button className="gum-btn gum-btn--pink" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save payout wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}
