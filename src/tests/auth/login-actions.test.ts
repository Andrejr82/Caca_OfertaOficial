import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockRevalidatePath,
  mockAfter,
  mockCreateServerSupabaseClient,
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
  mockRevalidatePath: vi.fn(),
  mockAfter: vi.fn((cb: () => any) => cb()),
  mockCreateServerSupabaseClient: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
  mockLogAuditAction: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/server", () => ({ after: mockAfter }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mockCreateServerSupabaseClient }));
vi.mock("@/lib/security/audit", () => ({ logAuditAction: mockLogAuditAction }));

import { signInAction, signOutAction } from "@/lib/auth/actions";

describe("signInAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redireciona para /login?error=supabase-env quando o Supabase não está configurado", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(null);
    const formData = new FormData();
    formData.append("email", "admin@cacaoferta.com");
    formData.append("password", "secret123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /login?error=supabase-env");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("mantém erro de credenciais no fluxo de login", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword: mockSignInWithPassword }
    });
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
      data: { user: null, session: null }
    });

    const formData = new FormData();
    formData.append("email", "wrong@cacaoferta.com");
    formData.append("password", "wrongpass");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /login?error=Invalid%20login%20credentials");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("limpa o Router Cache antes de redirecionar login válido para /dashboard", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword: mockSignInWithPassword, getUser: mockGetUser }
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
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mockRevalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mockRedirect.mock.invocationCallOrder.at(-1)!);
  });

  it("falha da auditoria não impede o redirect do login", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword: mockSignInWithPassword, getUser: mockGetUser }
    });
    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: { user: { id: "usr_999" }, session: { access_token: "tok_xyz" } }
    });
    mockLogAuditAction.mockRejectedValue(new Error("Database audit timeout"));

    const formData = new FormData();
    formData.append("email", "admin@cacaoferta.com");
    formData.append("password", "secret123");

    await expect(signInAction(formData)).rejects.toThrow("NEXT_REDIRECT: /dashboard");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("signOutAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("efetua logout, limpa o Router Cache e redireciona para /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "usr_123" } } });
    mockSignOut.mockResolvedValue({ error: null });
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { signOut: mockSignOut, getUser: mockGetUser }
    });

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
