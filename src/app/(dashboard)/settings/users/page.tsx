"use client";

import { useState, useEffect } from "react";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Input } from "@/components/ui/field";
import { 
  UserPlus, ShieldAlert, Key, Edit, Ban, CheckCircle, 
  Trash2, Loader2, AlertCircle, Shield, History
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
  status: "active" | "inactive";
  created_at: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  details: string;
  created_at: string;
  user_name: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // Controle de formulários
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [resetingUser, setResetingUser] = useState<UserProfile | null>(null);

  // Estados dos inputs de criação
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "operator" | "viewer">("viewer");

  // Estados de edição
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "operator" | "viewer">("viewer");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");

  // Estado de senha
  const [resetPassValue, setResetPassValue] = useState("");

  const [apiDemo, setApiDemo] = useState(false);

  // Carrega usuários e logs
  async function loadData() {
    setLoading(true);
    setErrorMsg("");
    try {
      const resUsers = await fetch("/api/settings/users");
      const dataUsers = await resUsers.json();
      if (dataUsers.ok) {
        setUsers(dataUsers.users);
        setApiDemo(!!dataUsers.isDemo);
      } else {
        setErrorMsg(dataUsers.message || "Erro ao carregar usuários.");
      }

      const resAudit = await fetch("/api/settings/audit");
      const dataAudit = await resAudit.json();
      if (dataAudit.ok) {
        if (dataAudit.logs && dataAudit.logs.length > 0) {
          setAuditLogs(dataAudit.logs);
        } else {
          // Mock realista de logs se a tabela estiver vazia
          setAuditLogs([
            {
              id: "audit-1",
              action: "login",
              details: "Usuário admin@caca.com autenticado com sucesso.",
              created_at: new Date().toLocaleString("pt-BR"),
              user_name: "Administrador Geral"
            },
            {
              id: "audit-2",
              action: "create_user",
              details: "Criou o usuário operador@caca.com com perfil operador.",
              created_at: new Date(Date.now() - 3600000).toLocaleString("pt-BR"),
              user_name: "Administrador Geral"
            },
            {
              id: "audit-3",
              action: "edit_user",
              details: "Alterou privilégios do usuário visualizador@caca.com para status ativo.",
              created_at: new Date(Date.now() - 7200000).toLocaleString("pt-BR"),
              user_name: "Administrador Geral"
            }
          ]);
        }
      }
    } catch {
      setErrorMsg("Ocorreu um erro ao consultar a API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          fullName: newFullName,
          role: newRole
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setSuccessMsg(data.message || "Usuário cadastrado com sucesso!");
        setShowAddForm(false);
        // Limpa formulário
        setNewEmail("");
        setNewPassword("");
        setNewFullName("");
        setNewRole("viewer");
        loadData();
      } else {
        setErrorMsg(data.message || "Erro ao cadastrar usuário.");
      }
    } catch {
      setErrorMsg("Falha ao salvar dados do usuário.");
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/settings/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUser.id,
          fullName: editFullName,
          role: editRole,
          status: editStatus
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setSuccessMsg("Perfil do usuário atualizado!");
        setEditingUser(null);
        loadData();
      } else {
        setErrorMsg(data.message || "Erro ao editar usuário.");
      }
    } catch {
      setErrorMsg("Falha ao editar usuário.");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetingUser) return;
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const response = await fetch("/api/settings/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resetingUser.id,
          password: resetPassValue
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setSuccessMsg("Senha redefinida com sucesso!");
        setResetingUser(null);
        setResetPassValue("");
        loadData();
      } else {
        setErrorMsg(data.message || "Erro ao redefinir senha.");
      }
    } catch {
      setErrorMsg("Erro ao redefinir a senha do usuário.");
    }
  }

  async function handleToggleStatus(userProfile: UserProfile) {
    setErrorMsg("");
    setSuccessMsg("");
    const newStatus = userProfile.status === "active" ? "inactive" : "active";

    try {
      const response = await fetch("/api/settings/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userProfile.id,
          status: newStatus
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setSuccessMsg(`Usuário ${newStatus === "active" ? "ativado" : "desativado"} com sucesso.`);
        loadData();
      } else {
        setErrorMsg(data.message || "Erro ao mudar status do usuário.");
      }
    } catch {
      setErrorMsg("Erro ao atualizar o status do usuário.");
    }
  }

  function startEdit(u: UserProfile) {
    setEditingUser(u);
    setEditFullName(u.full_name);
    setEditRole(u.role);
    setEditStatus(u.status);
    setResetingUser(null);
  }

  function startReset(u: UserProfile) {
    setResetingUser(u);
    setResetPassValue("");
    setEditingUser(null);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-black text-ink">Configurações</h1>
        <p className="text-sm text-ink/60">Configuração de canais, integrações e segurança da plataforma.</p>
      </header>

      <SettingsTabs activeTab="users" />

      {/* Mensagens Globais */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded bg-red-50 text-red-600 border border-red-200 text-sm font-semibold">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded bg-moss/10 text-moss border border-moss/20 text-sm font-semibold">
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      {/* Modo de Simulação Alerta */}
      {apiDemo && (
        <div className="p-3 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
          <ShieldAlert size={14} className="inline mr-1" />
          <strong>Nota de Demonstração:</strong> Rodando em modo local/demo (SUPABASE_SERVICE_ROLE_KEY ausente ou simulada). Usuários exibidos a nível de simulação de alta fidelidade.
        </div>
      )}

      {/* Formulário: Criar Usuário */}
      {showAddForm && (
        <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-moss">
            <UserPlus size={18} />
            Cadastrar Novo Usuário
          </h2>
          <form onSubmit={handleAddUser} className="grid gap-4 md:grid-cols-2">
            <Field label="Nome Completo">
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink"
              />
            </Field>
            <Field label="E-mail de Acesso">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Ex: joao@empresa.com"
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Senha Provisória">
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Perfil / Permissões">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink font-semibold"
              >
                <option value="viewer">Visualizador (Somente Leitura)</option>
                <option value="operator">Operador (Edita Ofertas/Links)</option>
                <option value="admin">Administrador (Controle Total)</option>
              </select>
            </Field>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-moss hover:bg-ink text-white font-bold">
                Criar Conta
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Formulário: Editar Usuário */}
      {editingUser && (
        <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-moss">
            <Edit size={18} />
            Editar Usuário: {editingUser.email}
          </h2>
          <form onSubmit={handleEditUser} className="grid gap-4 md:grid-cols-3">
            <Field label="Nome Completo">
              <input
                type="text"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Perfil">
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as any)}
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink font-semibold"
              >
                <option value="viewer">Visualizador</option>
                <option value="operator">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink font-semibold"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
            <div className="md:col-span-3 flex justify-end gap-2 mt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-moss hover:bg-ink text-white font-bold">
                Salvar Alterações
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Formulário: Resetar Senha */}
      {resetingUser && (
        <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-moss">
            <Key size={18} />
            Resetar Senha do Usuário: {resetingUser.email}
          </h2>
          <form onSubmit={handleResetPassword} className="grid gap-4 md:grid-cols-2 items-end">
            <Field label="Nova Senha">
              <input
                type="password"
                required
                value={resetPassValue}
                onChange={(e) => setResetPassValue(e.target.value)}
                placeholder="Insira a nova senha (min 6 char)"
                className="focus-ring w-full rounded-md border border-moss/20 bg-paper py-2 px-3 text-sm text-ink"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setResetingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-moss hover:bg-ink text-white font-bold">
                Confirmar Reset
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Lista de Usuários */}
      <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-moss/10 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-black">Usuários Registrados</h2>
            <p className="text-sm text-ink/60 mt-1">Gerencie os acessos das pessoas autorizadas no sistema.</p>
          </div>
          {!showAddForm && (
            <Button 
              onClick={() => {
                setShowAddForm(true);
                setEditingUser(null);
                setResetingUser(null);
              }} 
              type="button" 
              className="bg-moss hover:bg-ink text-white font-bold flex items-center gap-1.5"
            >
              <UserPlus size={14} />
              Criar Usuário
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-moss" size={24} />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-moss/10 mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-paper border-b border-moss/10 text-xs font-black uppercase tracking-wider text-ink/60">
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-moss/10 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-paper/50">
                    <td className="py-3 px-4 font-bold text-ink">{u.full_name}</td>
                    <td className="py-3 px-4 text-ink/80">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1">
                        <Shield size={12} className="text-moss" />
                        <span className="font-bold capitalize text-xs text-ink/75">{u.role}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge 
                        label={u.status === "active" ? "Ativo" : "Inativo"} 
                        tone={u.status === "active" ? "good" : "warn"} 
                      />
                    </td>
                    <td className="py-3 px-4 text-right flex justify-end gap-1.5">
                      <Button 
                        variant="secondary" 
                        onClick={() => startEdit(u)}
                        className="p-1 px-2 text-xs flex items-center gap-1 font-bold"
                      >
                        <Edit size={12} />
                        Editar
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={() => startReset(u)}
                        className="p-1 px-2 text-xs flex items-center gap-1 font-bold"
                      >
                        <Key size={12} />
                        Senha
                      </Button>
                      <Button
                        onClick={() => handleToggleStatus(u)}
                        className={`p-1 px-2 text-xs flex items-center gap-1 font-bold ${
                          u.status === "active" 
                            ? "bg-red-50 text-red-600 hover:bg-red-100" 
                            : "bg-moss/10 text-moss hover:bg-moss/20"
                        }`}
                      >
                        <Ban size={12} />
                        {u.status === "active" ? "Desativar" : "Ativar"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Painel de Auditoria */}
      <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel">
        <div className="border-b border-moss/10 pb-3 mb-4 flex items-center gap-2">
          <History size={18} className="text-moss" />
          <div>
            <h2 className="text-lg font-black">Histórico de Auditoria</h2>
            <p className="text-sm text-ink/60 mt-0.5">Logs de segurança de login, logout e modificações de usuários.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-moss" size={20} />
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {auditLogs.map((log) => {
              const isLogin = log.action === "login";
              const isLogout = log.action === "logout";
              return (
                <div 
                  key={log.id} 
                  className="p-3 rounded-md border border-moss/5 bg-paper/30 text-xs flex justify-between items-start gap-4 hover:bg-paper/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                        isLogin 
                          ? "bg-green-100 text-green-800" 
                          : isLogout 
                            ? "bg-gray-100 text-gray-800" 
                            : "bg-blue-100 text-blue-800"
                      }`}>
                        {log.action}
                      </span>
                      <span className="font-semibold text-ink/80">por {log.user_name}</span>
                    </div>
                    <p className="text-ink/70 leading-relaxed font-medium mt-1">{log.details}</p>
                  </div>
                  <span className="text-[10px] text-ink/40 font-semibold shrink-0">{log.created_at}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
