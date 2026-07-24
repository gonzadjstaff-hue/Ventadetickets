import { useState, type FormEvent } from "react";

interface ManualQrInputProps {
  onSubmitPayload: (payload: string) => void;
  disabled?: boolean;
}

/**
 * Carga manual del contenido del QR, solo para desarrollo (no hay lector de
 * cámara real en todos los entornos de prueba). Se oculta fuera de dev.
 */
export default function ManualQrInput({ onSubmitPayload, disabled }: ManualQrInputProps) {
  const [value, setValue] = useState("");

  if (!import.meta.env.DEV) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmitPayload(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-2">
      <label htmlFor="manual-qr-payload" className="text-xs font-medium uppercase tracking-[.1em] text-[#7d8790]">
        Pegar contenido del QR (solo desarrollo)
      </label>
      <input
        id="manual-qr-payload"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder="pulse-ticket:v1:..."
        className="rounded-xl border border-[rgba(170,181,190,.2)] bg-[#0C0C0C] px-4 py-2.5 text-[#E8EEF2] outline-none focus:border-[#4ADE80] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-full bg-[rgba(170,181,190,.12)] px-4 py-2 text-sm font-bold uppercase tracking-[.06em] text-[#E8EEF2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Validar
      </button>
    </form>
  );
}
