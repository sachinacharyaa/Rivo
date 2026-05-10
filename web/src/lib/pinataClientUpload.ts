/**
 * Upload files from the browser to Pinata public IPFS (v3 API).
 * Use a scoped Pinata JWT in VITE_PINATA_JWT so large files skip the API server body limit (e.g. Vercel).
 */
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

export type PinataRegisteredFile = {
  ipfsCid: string;
  fileName: string;
  mimeType: string;
};

function basenameOnly(name: string) {
  const s = name.trim() || "file.bin";
  const parts = s.split(/[/\\]/);
  return parts[parts.length - 1] || "file.bin";
}

export function getPinataBrowserJwt(): string | undefined {
  const v = import.meta.env.VITE_PINATA_JWT;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export async function uploadFilesViaPinataBrowser(files: File[]): Promise<PinataRegisteredFile[]> {
  const jwt = getPinataBrowserJwt();
  if (!jwt) {
    throw new Error("VITE_PINATA_JWT is not set. Add it to web/.env for direct Pinata uploads (use a scoped Pinata JWT).");
  }
  const out: PinataRegisteredFile[] = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file, basenameOnly(file.name));
    formData.append("network", "public");
    const res = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: formData,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Pinata upload failed (${res.status}): ${text.slice(0, 350)}`);
    }
    let json: { data?: { cid?: string }; cid?: string };
    try {
      json = JSON.parse(text) as { data?: { cid?: string }; cid?: string };
    } catch {
      throw new Error("Pinata returned invalid JSON.");
    }
    const cid = json.data?.cid ?? json.cid;
    if (!cid) throw new Error("Pinata response missing cid.");
    out.push({
      ipfsCid: String(cid),
      fileName: basenameOnly(file.name),
      mimeType: file.type || "application/octet-stream",
    });
  }
  return out;
}
