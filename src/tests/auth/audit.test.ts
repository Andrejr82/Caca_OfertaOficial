import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateServerSupabaseClient,
  mockCreateSupabaseAdminClient,
  mockServerInsert,
  mockAdminInsert,
  mockGetUser
} = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
  mockCreateSupabaseAdminClient: vi.fn(),
  mockServerInsert: vi.fn(),
  mockAdminInsert: vi.fn(),
  mockGetUser: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient
}));

import { logAuditAction } from "@/lib/security/audit";

describe("logAuditAction - Resiliência e Isolamento de Sessão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("utiliza cliente admin e userId direto sem chamar getUser() nem tocar em sessão/cookies", async () => {
    mockAdminInsert.mockResolvedValue({ error: null });
    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mockAdminInsert })
    });

    const result = await logAuditAction(
      "login",
      "Usuário autenticado",
      undefined,
      "usr_direct_123"
    );

    expect(result).toBe(true);
    expect(mockCreateSupabaseAdminClient).toHaveBeenCalled();
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockAdminInsert).toHaveBeenCalledWith({
      user_id: "usr_direct_123",
      action: "login",
      target_user_id: null,
      details: "Usuário autenticado"
    });
  });

  it("quando userId não é fornecido e adminClient existe, resolve via serverClient de forma segura", async () => {
    mockServerInsert.mockResolvedValue({ error: null });
    mockAdminInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "usr_resolved_456" } },
      error: null
    });

    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mockAdminInsert })
    });
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue({ insert: mockServerInsert })
    });

    const result = await logAuditAction("update_settings", "Alteração de config");

    expect(result).toBe(true);
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockAdminInsert).toHaveBeenCalledWith({
      user_id: "usr_resolved_456",
      action: "update_settings",
      target_user_id: null,
      details: "Alteração de config"
    });
  });

  it("captura falha de inserção no banco de dados e retorna false sem lançar exceção", async () => {
    mockAdminInsert.mockResolvedValue({
      error: { message: "relation 'audit_logs' does not exist" }
    });
    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mockAdminInsert })
    });

    const result = await logAuditAction("login", "Tentativa", undefined, "usr_123");

    expect(result).toBe(false);
  });

  it("captura erro inesperado de rede/exceção e retorna false sem quebrar o chamador", async () => {
    mockCreateSupabaseAdminClient.mockImplementation(() => {
      throw new Error("Unexpected admin client crash");
    });

    const result = await logAuditAction("login", "Falha de teste", undefined, "usr_123");

    expect(result).toBe(false);
  });
});
