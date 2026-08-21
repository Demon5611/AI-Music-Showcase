export async function fetchAuthenticatedBlob(
  mediaUrl: string,
  getToken: () => Promise<string | null>,
): Promise<Blob> {
  const token = await getToken();
  const response = await fetch(mediaUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type")?.split(";")[0]?.trim();
  const arrayBuffer = await blob.arrayBuffer();
  const resolvedType =
    contentType && contentType !== "application/octet-stream"
      ? contentType
      : blob.type && blob.type !== "application/octet-stream"
        ? blob.type
        : "application/octet-stream";

  return new Blob([arrayBuffer], { type: resolvedType });
}

export async function downloadAuthenticatedBlob(
  mediaUrl: string,
  filename: string,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const blob = await fetchAuthenticatedBlob(mediaUrl, getToken);
  const downloadType =
    filename.toLowerCase().endsWith(".mp4") && blob.type === "application/octet-stream"
      ? "video/mp4"
      : blob.type;
  const downloadBlob =
    downloadType === blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: downloadType });
  const objectUrl = URL.createObjectURL(downloadBlob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
