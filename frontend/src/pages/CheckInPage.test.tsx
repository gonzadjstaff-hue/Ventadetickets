import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { postCheckIn, type CheckInResponse } from "../api/checkIns";
import { demoEvent } from "../config/demoEvent";
import { AuthProvider } from "../features/auth/AuthContext";
import CheckInPage from "./CheckInPage";

/**
 * Los tests anteriores de este archivo mockeaban `postCheckIn` por completo,
 * así que nunca podían detectar que el frontend real omitía el header
 * `Authorization`: el backend ya exigía autenticación, pero el request real
 * nunca llevaba token. Por eso acá CheckInPage se renderiza dentro de un
 * AuthProvider real (no un `useAuth` mockeado a mano) — para confirmar de
 * punta a punta que el token que resuelve el AuthProvider efectivamente
 * llega a postCheckIn. Solo se mockean los límites externos: el SDK de
 * Firebase (authService), la API de sesión (api/auth) y la propia API de
 * check-in (api/checkIns). Mismo patrón que AdminDashboardPage.test.tsx.
 */
const { subscribeToAuthStateMock, getIdTokenMock, createSessionMock } = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  createSessionMock: vi.fn(),
}));

vi.mock("../features/auth/authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: vi.fn(),
  logout: vi.fn(),
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  createSession: createSessionMock,
}));

vi.mock("../api/checkIns", () => ({
  postCheckIn: vi.fn(),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: vi.fn().mockImplementation(function MockHtml5Qrcode() {
    return {
      isScanning: false,
      start: () => new Promise(() => {}), // nunca resuelve: estos tests manejan todo por carga manual.
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      clear: vi.fn(),
    };
  }),
}));

const mockedPostCheckIn = vi.mocked(postCheckIn);

const FAKE_USER = { uid: "uid-1", email: "validator@test.local" };
const VALIDATOR_PROFILE = { id: "user-1", email: "validator@test.local", role: "VALIDATOR", status: "ACTIVE" };
/** Valor de prueba, nunca una credencial real — solo usado para verificar que llega a postCheckIn. */
const FAKE_ID_TOKEN = "fake-id-token-abc";

function renderWithAuthenticatedUser() {
  subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
    callback(FAKE_USER);
    return () => {};
  });
  getIdTokenMock.mockResolvedValue(FAKE_ID_TOKEN);
  createSessionMock.mockResolvedValue({ user: VALIDATOR_PROFILE });

  return render(
    <AuthProvider>
      <CheckInPage />
    </AuthProvider>,
  );
}

/**
 * Simula el caso defensivo de un token que ya no es válido en el momento
 * exacto del check-in: la sesión de Firebase existe y se resolvió con éxito
 * al cargar la pantalla (primera llamada a getIdToken, usada por AuthProvider
 * para POST /api/auth/session), pero getIdToken() devuelve null en la
 * segunda llamada, la que dispara CheckInPage al intentar el check-in.
 */
function renderWithSessionThatExpiresBeforeCheckIn() {
  subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
    callback(FAKE_USER);
    return () => {};
  });
  getIdTokenMock.mockResolvedValueOnce(FAKE_ID_TOKEN).mockResolvedValueOnce(null);
  createSessionMock.mockResolvedValue({ user: VALIDATOR_PROFILE });

  return render(
    <AuthProvider>
      <CheckInPage />
    </AuthProvider>,
  );
}

async function submitManualPayload(user: ReturnType<typeof userEvent.setup>, payload: string) {
  await user.type(screen.getByLabelText(/contenido del qr/i), payload);
  await user.click(screen.getByRole("button", { name: /validar/i }));
}

const validResponse: CheckInResponse = {
  result: "VALID",
  message: "Acceso permitido.",
  ticketPublicId: "ticket-abc",
  holderName: "Ada Lovelace",
  ticketType: "General",
};

const alreadyUsedResponse: CheckInResponse = {
  result: "ALREADY_USED",
  message: "Este ticket ya fue utilizado.",
  ticketPublicId: "ticket-abc",
  holderName: "Ada Lovelace",
  ticketType: "General",
};

describe("CheckInPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza la pantalla de control de acceso con el bloque de cámara y la carga manual", () => {
    renderWithAuthenticatedUser();

    expect(screen.getByRole("heading", { name: /control de acceso/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar cámara/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/contenido del qr/i)).toBeInTheDocument();
  });

  it("validación manual exitosa: obtiene el token del contexto de auth y lo adjunta a postCheckIn", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/^acceso permitido$/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(getIdTokenMock).toHaveBeenCalled();
    expect(mockedPostCheckIn).toHaveBeenCalledWith(demoEvent.eventPublicId, "pulse-ticket:v1:abc", FAKE_ID_TOKEN);
  });

  it("el token de autenticación nunca aparece en pantalla", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByText(/^acceso permitido$/i);

    expect(document.body.textContent).not.toContain(FAKE_ID_TOKEN);
  });

  it("ticket ya utilizado", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(alreadyUsedResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/ticket ya utilizado/i)).toBeInTheDocument();
  });

  it("QR inválido", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockRejectedValue(new ApiError(400, "El código QR no es válido.", "INVALID_TICKET"));

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "esto-no-es-un-qr");

    expect(await screen.findByText(/qr inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/el código qr no es válido/i)).toBeInTheDocument();
  });

  it("error de red al llamar al backend de check-in (con token válido ya obtenido)", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockRejectedValue(new TypeError("Failed to fetch"));

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    expect(await screen.findByText(/error de conexión/i)).toBeInTheDocument();
    expect(screen.getByText(/no pudimos conectar con el servidor/i)).toBeInTheDocument();
  });

  it("evita requests duplicadas mientras hay una validación en curso", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: CheckInResponse) => void = () => {};
    mockedPostCheckIn.mockReturnValue(
      new Promise<CheckInResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");

    // Mientras está pendiente, el formulario de carga manual queda deshabilitado.
    const submitButton = screen.getByRole("button", { name: /validar/i });
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    expect(mockedPostCheckIn).toHaveBeenCalledTimes(1);

    resolvePromise(validResponse);
    await screen.findByText(/^acceso permitido$/i);

    expect(mockedPostCheckIn).toHaveBeenCalledTimes(1);
  });

  it("permite escanear el siguiente ticket tras un resultado", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByText(/^acceso permitido$/i);

    await user.click(screen.getByRole("button", { name: /escanear siguiente/i }));

    expect(screen.queryByText(/^acceso permitido$/i)).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/contenido del qr/i)).toBeInTheDocument();
  });

  it("no persiste nada en localStorage ni sessionStorage durante todo el flujo", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByText(/^acceso permitido$/i);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    setItemSpy.mockRestore();
  });

  it("no muestra el payload crudo del QR en ningún texto visible", async () => {
    const user = userEvent.setup();
    mockedPostCheckIn.mockResolvedValue(validResponse);

    renderWithAuthenticatedUser();
    await submitManualPayload(user, "pulse-ticket:v1:token-secreto-xyz");
    await screen.findByText(/^acceso permitido$/i);

    expect(document.body.textContent).not.toContain("token-secreto-xyz");
  });

  it("getIdToken() devuelve null en el momento del check-in (sesión inicial ya resuelta): no llama a postCheckIn ni crashea, y muestra un mensaje de sesión, no de red", async () => {
    const user = userEvent.setup();

    renderWithSessionThatExpiresBeforeCheckIn();

    // Confirma que la sesión inicial se resolvió con éxito (AuthProvider ya vinculó el perfil) antes de intentar el check-in.
    await waitFor(() => expect(createSessionMock).toHaveBeenCalledWith(FAKE_ID_TOKEN));

    await submitManualPayload(user, "pulse-ticket:v1:abc");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/sesión/i);
    expect(screen.getByText(/volvé a iniciar sesión/i)).toBeInTheDocument();
    expect(screen.queryByText(/error de conexión/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no pudimos conectar con el servidor/i)).not.toBeInTheDocument();
    expect(mockedPostCheckIn).not.toHaveBeenCalled();
  });

  it("getIdToken() devuelve null en el momento del check-in: permite reintentar sin quedar en una pantalla muerta", async () => {
    const user = userEvent.setup();

    renderWithSessionThatExpiresBeforeCheckIn();
    await waitFor(() => expect(createSessionMock).toHaveBeenCalledWith(FAKE_ID_TOKEN));

    await submitManualPayload(user, "pulse-ticket:v1:abc");
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/contenido del qr/i)).toBeInTheDocument();
  });
});
