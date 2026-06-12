import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAuditAction } from "@/lib/security/audit";

// GET: Listar usuários e perfis
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    // Checa se o usuário atual é admin
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = currentUserProfile?.role === "admin";

    // Cria o cliente admin do Supabase
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      // Fallback amigável caso não exista Service Role configurado (retorna o próprio perfil como admin simulado de teste)
      return NextResponse.json({
        ok: true,
        users: [
          {
            id: user.id,
            email: user.email || "admin@cacaoferta.com",
            full_name: currentUserProfile?.full_name || "Administrador Geral",
            role: currentUserProfile?.role || "admin",
            status: currentUserProfile?.status || "active",
            created_at: user.created_at
          }
        ],
        isDemo: true
      });
    }

    // Busca todos os perfis
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("*");

    // Busca os usuários da Auth Admin API
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) throw new Error(listError.message);

    // Associa perfis com usuários Auth
    const mergedUsers = users.map((u) => {
      const profile = profiles?.find((p) => p.id === u.id);
      return {
        id: u.id,
        email: u.email,
        full_name: profile?.full_name || "Usuário sem nome",
        role: profile?.role || "viewer",
        status: profile?.status || "active",
        created_at: u.created_at
      };
    });

    return NextResponse.json({ ok: true, users: mergedUsers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

// POST: Criar usuário
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    // Checa privilégios de Admin
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", user.id)
      .maybeSingle();

    if (currentProfile?.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Acesso restrito. Apenas administradores podem criar usuários." }, { status: 403 });
    }

    const { email, password, fullName, role } = await request.json();

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ ok: false, message: "Preencha todos os campos obrigatórios." }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json({ ok: false, message: "Ação impossível: SUPABASE_SERVICE_ROLE_KEY ausente no servidor." }, { status: 500 });
    }

    // Cria o usuário na Auth do Supabase
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError || !authData.user) {
      throw new Error(createError?.message || "Erro ao registrar usuário.");
    }

    // Salva/Upsert perfil na tabela public.profiles
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: authData.user.id,
        full_name: fullName,
        role: role || "viewer",
        status: "active"
      });

    if (profileError) {
      // Tenta remover o usuário criado para não deixar órfãos em caso de falha de constraint
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Erro ao salvar perfil: ${profileError.message}`);
    }

    // Registrar auditoria
    await logAuditAction(
      "create_user",
      `Criou o usuário ${email} com o perfil ${role}. Nome: ${fullName}`,
      authData.user.id
    );

    return NextResponse.json({ ok: true, message: "Usuário criado com sucesso!" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao processar criação.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

// PUT: Editar usuário (Alterar permissões, status ou resetar senha)
export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", user.id)
      .maybeSingle();

    if (currentProfile?.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Apenas administradores podem editar usuários." }, { status: 403 });
    }

    const { id: targetUserId, fullName, role, status, password } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ ok: false, message: "ID do usuário não fornecido." }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) throw new Error("Cliente Admin do Supabase não configurado.");

    // Se uma nova senha for fornecida, fazemos o reset
    if (password) {
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: password
      });
      if (passwordError) throw new Error(`Erro ao resetar senha: ${passwordError.message}`);
      
      await logAuditAction("reset_password", "Resetou a senha do usuário.", targetUserId);
    }

    // Atualiza tabela public.profiles
    const updateData: any = {};
    if (fullName) updateData.full_name = fullName;
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(updateData)
      .eq("id", targetUserId);

    if (profileError) throw new Error(`Erro ao atualizar perfil: ${profileError.message}`);

    // Auditoria
    await logAuditAction(
      "edit_user",
      `Alterou permissões/status do usuário. Role: ${role}, Status: ${status}`,
      targetUserId
    );

    return NextResponse.json({ ok: true, message: "Usuário atualizado com sucesso!" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao processar edição.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
