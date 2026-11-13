import { api } from "../services/api";

export async function fetchAuthenticatedBlobUrl(url: string, mimeType = "application/pdf"): Promise<string> {
  const res = await api.get(url, { responseType: "blob" });
  return window.URL.createObjectURL(new Blob([res.data], { type: mimeType }));
}

export function triggerBlobDownload(blobUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = blobUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const blobUrl = await fetchAuthenticatedBlobUrl(url);
  triggerBlobDownload(blobUrl, filename);
  window.URL.revokeObjectURL(blobUrl);
}

