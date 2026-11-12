import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  Edit2,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { api, extractErrorMessage } from "../services/api";
import { AuditLog, PermissionItem, RoleItem, User, UserPermissionOverride } from "../types/auth";
import { PaginatedResponse } from "../types/erp";
import { formatDate } from "../utils/formatters";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { EmptyState } from "../components/common/EmptyState";

type TabType = "users" | "roles" | "audit";
type OverrideChoice = "default" | "grant" | "revoke";

export const AdminPage: React.FC = () => {
  const [tab, setTab] = useState<TabType>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditModule, setAuditModule] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create/Edit User modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    full_name: "",
    mobile: "",
    password: "",
    role_name: "ADMIN",
    is_active: true,
  });
  const [savingUser, setSavingUser] = useState(false);

  // User Overrides modal state
  const [overrideUser, setOverrideUser] = useState<User | null>(null);
  const [overrideChoices, setOverrideChoices] = useState<Record<string, OverrideChoice>>({});
  const [savingOverrides, setSavingOverrides] = useState(false);

  // Role Matrix tab state
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [rolePermSet, setRolePermSet] = useState<Set<string>>(new Set());
  const [savingRolePerms, setSavingRolePerms] = useState(false);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, PermissionItem[]> = {};
    for (const p of permissions) {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const loadCoreData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, pRes] = await Promise.all([
        api.get<User[]>("/users"),
        api.get<RoleItem[]>("/users/roles"),
        api.get<PermissionItem[]>("/users/permissions"),
      ]);
      setUsers(uRes.data);
      setRoles(rRes.data);
      setPermissions(pRes.data);
      if (rRes.data.length > 0 && selectedRoleId === null) {
        const defaultRole = rRes.data.find((r) => r.name !== "OWNER") || rRes.data[0];
        setSelectedRoleId(defaultRole.id);
        setRolePermSet(new Set(defaultRole.permissions));
      }
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to load admin data.") });
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async (page = auditPage, mod = auditModule, search = auditSearch) => {
    try {
      const res = await api.get<PaginatedResponse<AuditLog>>("/audit/logs", {
        params: {
          page,
          page_size: 25,
          module: mod || undefined,
          search: search || undefined,
        },
      });
      setAuditLogs(res.data.items);
      setAuditTotal(res.data.total);
      setAuditTotalPages(res.data.total_pages);
      setAuditPage(res.data.page);
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to load audit logs.") });
    }
  };

  useEffect(() => {
    loadCoreData();
    loadAuditLogs(1, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );

  const handleSelectRole = (role: RoleItem) => {
    setSelectedRoleId(role.id);
    setRolePermSet(new Set(role.permissions));
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      username: "",
      email: "",
      full_name: "",
      mobile: "",
      password: "",
      role_name: "ADMIN",
      is_active: true,
    });
    setUserModalOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      mobile: u.mobile || "",
      password: "",
      role_name: u.role_name,
      is_active: u.is_active,
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    setMessage(null);
    try {
      if (editingUser) {
        await api.patch(`/users/${editingUser.id}`, {
          email: userForm.email,
          full_name: userForm.full_name,
          mobile: userForm.mobile || null,
          role_name: editingUser.is_owner ? undefined : userForm.role_name,
          is_active: editingUser.is_owner ? undefined : userForm.is_active,
          password: userForm.password.trim() ? userForm.password : undefined,
        });
        setMessage({ type: "success", text: `Updated user '${editingUser.username}'.` });
      } else {
        await api.post("/users", {
          username: userForm.username,
          email: userForm.email,
          full_name: userForm.full_name,
          mobile: userForm.mobile || undefined,
          password: userForm.password,
          role_name: userForm.role_name,
          is_active: userForm.is_active,
          overrides: [],
        });
        setMessage({ type: "success", text: `Created user '${userForm.username}'.` });
      }
      setUserModalOpen(false);
      await loadCoreData();
      await loadAuditLogs(1, auditModule, auditSearch);
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to save user.") });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeactivateUser = async (u: User) => {
    if (!window.confirm(`Deactivate account '${u.username}'? They will be logged out immediately.`)) return;
    setMessage(null);
    try {
      await api.delete(`/users/${u.id}`);
      setMessage({ type: "success", text: `Deactivated '${u.username}'.` });
      await loadCoreData();
      await loadAuditLogs(1, auditModule, auditSearch);
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to deactivate user.") });
    }
  };

  const openOverridesModal = (u: User) => {
    const map: Record<string, OverrideChoice> = {};
    for (const p of permissions) {
      map[p.code] = "default";
    }
    for (const ov of u.overrides || []) {
      map[ov.permission_code] = ov.granted ? "grant" : "revoke";
    }
    setOverrideChoices(map);
    setOverrideUser(u);
  };

  const handleSaveOverrides = async () => {
    if (!overrideUser) return;
    setSavingOverrides(true);
    setMessage(null);
    try {
      const overrides: UserPermissionOverride[] = Object.entries(overrideChoices)
        .filter(([, choice]) => choice !== "default")
        .map(([permission_code, choice]) => ({
          permission_code,
          granted: choice === "grant",
        }));
      await api.put(`/users/${overrideUser.id}/permissions`, { overrides });
      setMessage({
        type: "success",
        text: `Updated permission overrides for '${overrideUser.username}'.`,
      });
      setOverrideUser(null);
      await loadCoreData();
      await loadAuditLogs(1, auditModule, auditSearch);
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to update overrides.") });
    } finally {
      setSavingOverrides(false);
    }
  };

  const toggleRolePermission = (code: string) => {
    if (selectedRole?.name === "OWNER") return;
    setRolePermSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleModulePermissions = (items: PermissionItem[], grantAll: boolean) => {
    if (selectedRole?.name === "OWNER") return;
    setRolePermSet((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (grantAll) next.add(item.code);
        else next.delete(item.code);
      }
      return next;
    });
  };

  const handleSaveRolePermissions = async () => {
    if (!selectedRole || selectedRole.name === "OWNER") return;
    setSavingRolePerms(true);
    setMessage(null);
    try {
      const updated = await api.put<RoleItem>(`/users/roles/${selectedRole.id}/permissions`, {
        permission_codes: Array.from(rolePermSet),
      });
      setRoles((prev) => prev.map((r) => (r.id === updated.data.id ? updated.data : r)));
      setMessage({
        type: "success",
        text: `Saved ${updated.data.permissions.length} permission(s) for role '${updated.data.display_name}'.`,
      });
      await loadCoreData();
      await loadAuditLogs(1, auditModule, auditSearch);
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to update role permissions.") });
    } finally {
      setSavingRolePerms(false);
    }
  };

  const overrideUserRolePerms = useMemo(() => {
    if (!overrideUser) return new Set<string>();
    const role = roles.find((r) => r.id === overrideUser.role_id);
    return new Set(role?.permissions || []);
  }, [overrideUser, roles]);

  const auditModules = useMemo(() => {
    const mods = new Set(auditLogs.map((a) => a.module));
    ["auth", "admin", "settings", "purchases", "sales", "orders", "inventory", "products", "accounts", "expenses", "employees"].forEach((m) => mods.add(m));
    return Array.from(mods).sort();
  }, [auditLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Owner Administration & Security</h1>
          <p className="text-sm text-slate-500">
            Manage Admin and staff accounts, configure granular RBAC permissions, and inspect system audit logs.
          </p>
        </div>

        {tab === "users" && (
          <button type="button" onClick={openCreateUser} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add Staff / Admin User
          </button>
        )}
      </div>

      {message && (
        <div
          className={`rounded-xl p-3.5 text-sm border ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "users"
              ? "bg-navy-800 text-gold-300"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Users className="h-4 w-4" />
          Users & Overrides ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("roles")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "roles"
              ? "bg-navy-800 text-gold-300"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          Role Permissions Matrix
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("audit");
            loadAuditLogs(1, auditModule, auditSearch);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "audit"
              ? "bg-navy-800 text-gold-300"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Activity className="h-4 w-4" />
          Audit Logs ({auditTotal})
        </button>
      </div>

      {/* TAB 1: USERS */}
      {tab === "users" && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Overrides</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-navy-900">{u.full_name}</div>
                        <div className="text-xs text-slate-500">@{u.username}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>{u.email}</div>
                        <div>{u.mobile || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.is_owner ? "bg-gold-100 text-gold-800" : "bg-navy-100 text-navy-800"
                          }`}
                        >
                          {u.role_display_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {u.is_owner ? (
                          <span className="text-gold-700 font-medium">All Permissions</span>
                        ) : u.overrides.length > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
                            {u.overrides.length} custom rule(s)
                          </span>
                        ) : (
                          <span>Role default ({u.permissions.length})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {u.last_login_at ? formatDate(u.last_login_at) : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-navy-800"
                            title="Edit User"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {!u.is_owner && (
                            <>
                              <button
                                type="button"
                                onClick={() => openOverridesModal(u)}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-50 hover:text-amber-700"
                                title="Permission Overrides"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              {u.is_active && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivateUser(u)}
                                  className="p-1.5 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                  title="Deactivate User"
                                >
                                  <UserX className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ROLE PERMISSIONS MATRIX */}
      {tab === "roles" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-2">
            <div className="card p-3 space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                ERP Roles
              </p>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelectRole(role)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    selectedRole?.id === role.id
                      ? "bg-navy-800 text-gold-300"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="text-sm font-semibold">{role.display_name}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      selectedRole?.id === role.id ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {role.permissions.length} permission(s)
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-9">
            {selectedRole && (
              <div className="card p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserCog className="h-5 w-5 text-navy-700" />
                      <h2 className="text-lg font-bold text-navy-900">
                        {selectedRole.display_name} ({selectedRole.name})
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedRole.name === "OWNER"
                        ? "OWNER always retains unrestricted access to every module and permission."
                        : selectedRole.description || "Configure default permissions assigned to this role."}
                    </p>
                  </div>

                  {selectedRole.name !== "OWNER" && (
                    <button
                      type="button"
                      onClick={handleSaveRolePermissions}
                      disabled={savingRolePerms}
                      className="btn-gold"
                    >
                      <Check className="h-4 w-4" />
                      {savingRolePerms ? "Saving..." : "Save Role Permissions"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupedPermissions.map(([mod, items]) => {
                    const checkedCount = items.filter((i) => rolePermSet.has(i.code)).length;
                    const isOwnerRole = selectedRole.name === "OWNER";
                    return (
                      <div key={mod} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
                            {mod} ({checkedCount}/{items.length})
                          </span>
                          {!isOwnerRole && (
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => toggleModulePermissions(items, true)}
                                className="text-navy-700 hover:underline font-medium"
                              >
                                All
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => toggleModulePermissions(items, false)}
                                className="text-slate-500 hover:underline"
                              >
                                None
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {items.map((perm) => {
                            const checked = isOwnerRole || rolePermSet.has(perm.code);
                            return (
                              <label
                                key={perm.code}
                                className={`flex items-start gap-2.5 text-xs ${
                                  isOwnerRole ? "opacity-80 cursor-not-allowed" : "cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isOwnerRole}
                                  onChange={() => toggleRolePermission(perm.code)}
                                  className="mt-0.5 rounded border-slate-300 text-navy-800 focus:ring-navy-700"
                                />
                                <div>
                                  <span className="font-semibold text-slate-800">{perm.code}</span>
                                  {perm.description && (
                                    <p className="text-[11px] text-slate-500">{perm.description}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {tab === "audit" && (
        <div className="space-y-4">
          <div className="card p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action, username, or description..."
                className="input-field pl-9"
              />
            </div>
            <select
              value={auditModule}
              onChange={(e) => {
                setAuditModule(e.target.value);
                loadAuditLogs(1, e.target.value, auditSearch);
              }}
              className="input-field sm:w-48"
            >
              <option value="">All Modules</option>
              {auditModules.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadAuditLogs(1, auditModule, auditSearch)}
              className="btn-primary"
            >
              Apply Filter
            </button>
          </div>

          <div className="card overflow-hidden">
            {auditLogs.length === 0 ? (
              <EmptyState title="No audit logs matched" description="Try adjusting module or search criteria." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Module</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-navy-900">
                          {log.username || "system"}
                        </td>
                        <td className="px-4 py-2.5 uppercase font-medium text-slate-600">
                          {log.module}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex px-2 py-0.5 rounded bg-navy-50 text-navy-800 font-semibold">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{log.description}</td>
                        <td className="px-4 py-2.5 text-slate-500">{log.ip_address || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {auditTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Page {auditPage} of {auditTotalPages} ({auditTotal} entries)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={auditPage <= 1}
                    onClick={() => loadAuditLogs(auditPage - 1, auditModule, auditSearch)}
                    className="btn-secondary py-1 px-3 text-xs"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={auditPage >= auditTotalPages}
                    onClick={() => loadAuditLogs(auditPage + 1, auditModule, auditSearch)}
                    className="btn-secondary py-1 px-3 text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `Edit User: ${editingUser.username}` : "Create Staff / Admin User"}
        subtitle="Assign role and login credentials for Sri Vasavi Textiles ERP."
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Full Name</label>
              <input
                required
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="input-field"
                placeholder="e.g. Karthik Sharma"
              />
            </div>
            <div>
              <label className="label-text">Username</label>
              <input
                required
                disabled={!!editingUser}
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className="input-field disabled:bg-slate-100"
                placeholder="karthik.admin"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Email</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="input-field"
                placeholder="karthik@srivasavitextiles.com"
              />
            </div>
            <div>
              <label className="label-text">Mobile</label>
              <input
                value={userForm.mobile}
                onChange={(e) => setUserForm({ ...userForm, mobile: e.target.value })}
                className="input-field"
                placeholder="+91 9876543210"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Role</label>
              <select
                disabled={editingUser?.is_owner}
                value={userForm.role_name}
                onChange={(e) => setUserForm({ ...userForm, role_name: e.target.value })}
                className="input-field disabled:bg-slate-100"
              >
                {roles
                  .filter((r) => (editingUser?.is_owner ? true : r.name !== "OWNER"))
                  .map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.display_name} ({r.name})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label-text">
                {editingUser ? "New Password (leave blank to keep)" : "Password (min 8 chars)"}
              </label>
              <input
                type="password"
                required={!editingUser}
                minLength={editingUser ? undefined : 8}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="input-field"
                placeholder="********"
              />
            </div>
          </div>

          {!editingUser?.is_owner && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={userForm.is_active}
                onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
                className="rounded border-slate-300 text-navy-800"
              />
              Account Active (allow login)
            </label>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setUserModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={savingUser} className="btn-primary">
              {savingUser ? "Saving..." : editingUser ? "Update User" : "Create User"}
            </button>
          </div>
        </form>
      </Modal>

      {/* PER-USER PERMISSION OVERRIDES MODAL */}
      <Modal
        open={!!overrideUser}
        onClose={() => setOverrideUser(null)}
        title={`Permission Overrides: ${overrideUser?.full_name || ""}`}
        subtitle={`Base Role: ${overrideUser?.role_display_name || ""}. Explicitly grant or revoke permissions beyond the role default.`}
        maxWidthClass="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {groupedPermissions.map(([mod, items]) => (
              <div key={mod} className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-navy-800">{mod}</p>
                {items.map((perm) => {
                  const roleHas = overrideUserRolePerms.has(perm.code);
                  const choice = overrideChoices[perm.code] || "default";
                  return (
                    <div key={perm.code} className="flex items-center justify-between gap-2 text-xs py-1 border-t border-slate-100 first:border-t-0">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{perm.code}</div>
                        <div className="text-[11px] text-slate-500">
                          Role default: {roleHas ? "Allow" : "Deny"}
                        </div>
                      </div>
                      <select
                        value={choice}
                        onChange={(e) =>
                          setOverrideChoices((prev) => ({
                            ...prev,
                            [perm.code]: e.target.value as OverrideChoice,
                          }))
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                      >
                        <option value="default">Role Default ({roleHas ? "Allow" : "Deny"})</option>
                        <option value="grant">Explicit Grant</option>
                        <option value="revoke">Explicit Revoke</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOverrideUser(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOverrides}
              disabled={savingOverrides}
              className="btn-gold"
            >
              {savingOverrides ? "Saving..." : "Save User Overrides"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

