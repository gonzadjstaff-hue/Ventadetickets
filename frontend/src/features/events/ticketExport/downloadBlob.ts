/** Dispara la descarga de un Blob ya armado con el nombre de archivo indicado. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revocar en el siguiente tick: algunos navegadores necesitan que la URL
  // siga siendo válida en el instante inmediato posterior al click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
