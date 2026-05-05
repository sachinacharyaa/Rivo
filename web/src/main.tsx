import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Buffer } from "buffer";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviders } from "./WalletProviders";
import "./styles.css";

if (!("Buffer" in globalThis)) {
  // Solana/web3 and spl-token expect Node's Buffer global in browser runtime.
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

type RootErrorBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  public state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Root render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "Inter, system-ui, sans-serif" }}>
          <h1 style={{ marginBottom: "12px" }}>Rivo crashed while rendering</h1>
          <p style={{ marginBottom: "8px" }}>Open this error and share it here:</p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f3f3f3",
              padding: "12px",
              borderRadius: "8px",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function renderFatal(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="padding:24px;font-family:Inter,system-ui,sans-serif;">
      <h1 style="margin:0 0 12px;">Rivo failed to start</h1>
      <pre style="white-space:pre-wrap;background:#f3f3f3;padding:12px;border-radius:8px;">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  console.error("Global error:", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

async function bootstrap() {
  try {
    const { App } = await import("./App");
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <RootErrorBoundary>
          <WalletProviders>
            <BrowserRouter>
              <App />
            </BrowserRouter>
            <Analytics />
            <SpeedInsights />
          </WalletProviders>
        </RootErrorBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n\n${error.stack || ""}` : String(error);
    console.error("Bootstrap failed:", error);
    renderFatal(message);
  }
}

void bootstrap();
