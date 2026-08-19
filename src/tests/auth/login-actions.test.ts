import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks hoisted
const {
  mockRedirect,
  mockAfter,
  mockCreateServerSupabaseClient,
  mockCreateSupabaseAdminClient,
  mockSignInWithPassword,
  mockSignOut,
  mockGetUser,
  mockLogAuditAction
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT: ${url}`);
    (err as any).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  mockAfter: vi.fn((cb: () => any) => {
    // Executa ou agenda
    cb();
  }),
  mockCreateServerSupabaseClient: vi.fn(),
  mockCreateSupabaseAdminClient: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
  mockLogAuditAction: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect
}));

vi.mock("next/server", () => ({
  after: mockAfter
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient
}));

vi.mock("@/lib/security/audit", () => ({
  logAuditAction: mockLogAuditAction
}));

import { signInAction, signOutAction } from "@/lib/auth/actions";

describe("signInAction - Autenticação e Redirecionamento Cirúrgico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redireciona para /login?error=supabase-env quando o Supabase não está configurado", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("email", "admin@cacaoferta.com");
    formData.append("password", "secret123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /login?error=supabase-env");
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockLogAuditAction).not.toHaveBeenCalled();
  });

  it("redireciona para /login?error=... quando as credenciais são inválidas", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        getUser: mockGetUser
      }
    });

    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
      data: { user: null, session: null }
    });

    const formData = new FormData();
    formData.append("email", "wrong@cacaoferta.com");
    formData.append("password", "wrongpass");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /login?error=Invalid%20login%20credentials");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "wrong@cacaoferta.com",
      password: "wrongpass"
    });
    expect(mockLogAuditAction).not.toHaveBeenCalled();
  });

  it("autentica com sucesso e redireciona para /dashboard sem chamar getUser concorrente", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        getUser: mockGetUser
      }
    });

    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: {
        user: { id: "usr_12345", email: "admin@cacaoferta.com" },
        session: { access_token: "tok_abc" }
      }
    });

    mockLogAuditAction.mockResolvedValue(true);

    const formData = new FormData();
    formData.append("email", "admin@cacaoferta.com");
    formData.append("password", "secret123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /dashboard");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@cacaoferta.com",
      password: "secret123"
    });

    // Não deve invocar getUser() no cliente de sessão
    expect(mockGetUser).not.toHaveBeenCalled();

    // Deve ter despachado auditoria pós-resposta passando o id resolvido
    expect(mockLogAuditAction).toHaveBeenCalledWith(
      "login",
      "Usuário autenticado com sucesso: admin@cacaoferta.com",
      undefined,
      "usr_12345"
    );
  });

  it("falha ou lentidão da auditoria NÃO impede nem bloqueia o login com sucesso", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        getUser: mockGetUser
      }
    });

    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: {
        user: { id: "usr_999", email: "admin@cacaoferta.com" },
        session: { access_token: "tok_xyz" }
      }
    });

    // Simula erro ou rejeição na auditoria
    mockLogAuditAction.mockRejectedValue(new Error("Database audit timeout"));

    const formData = new FormData();
    formData.append("email", "admin@cacaoferta.com");
    formData.append("password", "secret123");

    // O login DEVE continuar redirecionando para /dashboard sem lançar o erro da auditoria
    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /dashboard");
  });
});

describe("signOutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("efetua logout e redireciona para /login", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "usr_123" } }
    });
    mockSignOut.mockResolvedValue({ error: null });

    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
        getUser: mockGetUser
      }
    });

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockSignOut).toHaveBeenCalled();
  });
});
