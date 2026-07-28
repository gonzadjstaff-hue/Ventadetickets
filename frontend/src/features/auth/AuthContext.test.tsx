import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

/**
 * Aislado por completo: se mockea `authService` y `api/auth` (createSession)
 * enteros (nunca se llama al SDK real de Firebase ni al backend real).
 * `firebaseClient.ts` sí se importa de verdad, pero solo para reutilizar la
 * clase `FirebaseNotConfiguredError` — no tiene efecto secundario al
 * importarse (ver ese archivo).
 */
const {
  subscribeToAuthStateMock,
  loginWithEmailMock,
  logoutMock,
  getIdTokenMock,
  mapFirebaseAuthErrorMock,
  createSessionMock,
} = vi.hoisted(() => ({
  subscribeToAuthStateMock: vi.fn(),
  loginWithEmailMock: vi.fn(),
  logoutMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  mapFirebaseAuthErrorMock: vi.fn(() => "Email o contraseña incorrectos."),
  createSessionMock: vi.fn(),
}));

vi.mock("./authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: loginWithEmailMock,
  logout: logoutMock,
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: mapFirebaseAuthErrorMock,
}));

vi.mock("../../api/auth", () => ({
  createSession: createSessionMock,
}));

const FAKE_USER = { uid: "uid-1", email: "admin@test.local" };
const FAKE_PROFILE = { id: "user-1", email: "admin@test.local", role: "ADMIN", status: "ACTIVE" };

function Probe() {
  const { user, loading, loginError, configError, profile, profileLoading, profileError, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="email">{user?.email ?? "none"}</span>
      <span data-testid="login-error">{loginError ?? "none"}</span>
      <span data-testid="config-error">{configError ?? "none"}</span>
      <span data-testid="profile-loading">{String(profileLoading)}</span>
      <span data-testid="profile-role">{profile?.role ?? "none"}</span>
      <span data-testid="profile-error">{profileError ?? "none"}</span>
      <button
        onClick={() => {
          login("a@test.local", "secret").catch(() => {});
        }}
      >
        login
      </button>
      <button
        onClick={() => {
          void logout();
        }}
      >
        logout
      </button>
    </div>
  );
}

describe("AuthProvider / useAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("arranca en loading=true y pasa a false cuando Firebase resuelve el estado inicial (sin sesión)", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("email")).toHaveTextContent("none");
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("login exitoso: llama primero a POST /api/auth/session (createSession) y expone el perfil devuelto por el backend", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockImplementation(async () => {
      emitUser?.(FAKE_USER);
      return FAKE_USER;
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: FAKE_PROFILE });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("loading");

    await user.click(screen.getByText("login"));

    expect(await screen.findByTestId("profile-role")).toHaveTextContent("ADMIN");
    expect(createSessionMock).toHaveBeenCalledWith("id-token-abc");
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });

  it("recarga con usuario Firebase existente: llama a createSession automáticamente para rehidratar la sesión (sin pasar por login)", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: FAKE_PROFILE });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("profile-role")).toHaveTextContent("ADMIN");
    expect(loginWithEmailMock).not.toHaveBeenCalled();
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "No autorizado."],
    [403, "No tenés permisos para realizar esta acción."],
    [409, "Esta cuenta ya está vinculada a otro usuario de Firebase."],
  ])("error %i de POST /api/auth/session: expone el mensaje del backend en profileError, sin perfil", async (status, message) => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockRejectedValue(new ApiError(status, message, "SOME_CODE"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("profile-error")).toHaveTextContent(message);
    expect(screen.getByTestId("profile-role")).toHaveTextContent("none");
  });

  it("error de login: expone un mensaje claro (nunca el error crudo de Firebase) y no deja al usuario logueado", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    });
    loginWithEmailMock.mockRejectedValue(
      Object.assign(new Error("Firebase: wrong-password (auth/wrong-password)."), { code: "auth/wrong-password" }),
    );

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("loading");

    await user.click(screen.getByText("login"));

    expect(await screen.findByTestId("login-error")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByTestId("email")).toHaveTextContent("none");
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("logout: llama al servicio de logout y limpia perfil/usuario del contexto", async () => {
    let emitUser: ((user: unknown) => void) | undefined;
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      emitUser = callback;
      callback(FAKE_USER);
      return () => {};
    });
    getIdTokenMock.mockResolvedValue("id-token-abc");
    createSessionMock.mockResolvedValue({ user: FAKE_PROFILE });
    logoutMock.mockImplementation(async () => {
      emitUser?.(null);
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("profile-role");

    await user.click(screen.getByText("logout"));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("email")).toHaveTextContent("none");
    expect(screen.getByTestId("profile-role")).toHaveTextContent("none");
  });

  it("configError: si subscribeToAuthState lanza FirebaseNotConfiguredError, deja de cargar y expone un mensaje claro", async () => {
    const { FirebaseNotConfiguredError } = await import("./firebaseClient");
    subscribeToAuthStateMock.mockImplementation(() => {
      throw new FirebaseNotConfiguredError();
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("config-error")).not.toHaveTextContent("none");
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
