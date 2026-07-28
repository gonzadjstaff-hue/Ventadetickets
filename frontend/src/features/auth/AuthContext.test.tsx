import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

/**
 * Aislado por completo: se mockea `authService` entero (nunca se llama al
 * SDK real de Firebase). `firebaseClient.ts` sí se importa de verdad, pero
 * solo para reutilizar la clase `FirebaseNotConfiguredError` — no tiene
 * efecto secundario al importarse (ver ese archivo).
 */
const { subscribeToAuthStateMock, loginWithEmailMock, logoutMock, getIdTokenMock, mapFirebaseAuthErrorMock } = vi.hoisted(
  () => ({
    subscribeToAuthStateMock: vi.fn(),
    loginWithEmailMock: vi.fn(),
    logoutMock: vi.fn(),
    getIdTokenMock: vi.fn(),
    mapFirebaseAuthErrorMock: vi.fn(() => "Email o contraseña incorrectos."),
  }),
);

vi.mock("./authService", () => ({
  subscribeToAuthState: subscribeToAuthStateMock,
  loginWithEmail: loginWithEmailMock,
  logout: logoutMock,
  getIdToken: getIdTokenMock,
  mapFirebaseAuthError: mapFirebaseAuthErrorMock,
}));

const FAKE_USER = { uid: "uid-1", email: "admin@test.local" };

function Probe() {
  const { user, loading, loginError, configError, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="email">{user?.email ?? "none"}</span>
      <span data-testid="login-error">{loginError ?? "none"}</span>
      <span data-testid="config-error">{configError ?? "none"}</span>
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
  });

  it("login exitoso: el listener de Firebase actualiza el usuario expuesto por el contexto", async () => {
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

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("loading");

    await user.click(screen.getByText("login"));

    expect(await screen.findByTestId("email")).toHaveTextContent("admin@test.local");
    expect(loginWithEmailMock).toHaveBeenCalledWith("a@test.local", "secret");
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
  });

  it("logout: llama al servicio de logout", async () => {
    subscribeToAuthStateMock.mockImplementation((callback: (user: unknown) => void) => {
      callback(FAKE_USER);
      return () => {};
    });
    logoutMock.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("email");

    await user.click(screen.getByText("logout"));

    expect(logoutMock).toHaveBeenCalledTimes(1);
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
  });
});
