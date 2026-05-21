import { api } from "./api";
import { getPinataBrowserJwt, uploadFilesViaPinataBrowser } from "./pinataClientUpload";

export type DeliveryFileResponse = {
  ipfsCid: string;
  fileName: string;
  mimeType: string;
  downloadUrl?: string;
  backupUrl?: string;
};

export type DigitalProductUploadResponse = {
  deliveryMode: string;
  ipfsCid: string;
  encryptedContentKey: string;
  encryptionAlgorithm?: string;
  fileName: string;
  mimeType: string;
  downloadUrl?: string;
  backupUrl?: string;
  files?: DeliveryFileResponse[];
};

const HOSTED_UPLOAD_HELP =
  "File upload is not configured on the server. In Vercel → Settings → Environment Variables add PINATA_JWT (Pinata → API Keys → JWT), redeploy the API, then add the same value as VITE_PINATA_JWT and redeploy the site (browser uploads, recommended for large files). Optionally set IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs";

async function serverUploadsPinata(): Promise<boolean> {
  try {
    const { data } = await api.get<{ uploads?: string }>("/health");
    return data.uploads === "pinata";
  } catch {
    return false;
  }
}

/** Upload delivery files: browser→Pinata when VITE_PINATA_JWT is set, else API→Pinata/Kubo. */
export async function uploadProductDeliveryFiles(
  files: File[],
): Promise<{ data: DigitalProductUploadResponse }> {
  if (getPinataBrowserJwt()) {
    const registered = await uploadFilesViaPinataBrowser(files);
    return api.post<DigitalProductUploadResponse>("/digital-products/register-ipfs", {
      files: registered,
    });
  }

  if (import.meta.env.PROD) {
    const pinataOk = await serverUploadsPinata();
    if (!pinataOk) {
      throw new Error(HOSTED_UPLOAD_HELP);
    }
  }

  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return api.post<DigitalProductUploadResponse>("/digital-products/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
