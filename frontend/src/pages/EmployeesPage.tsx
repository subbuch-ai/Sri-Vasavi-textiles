import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Edit2, Plus, UserX } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { AuditLog } from "../types/auth";
import { Employee, EmployeeTask, PaginatedResponse } from "../types/erp";
import { formatDate, formatINR, todayISO } from "../utils/formatters";

const DEFAULT_DEPARTMENTS = [
  "Sales & Retail Counter",
  "Wholesale & B2B Orders",
  "Accounts & Finance",
  "Warehouse & Inventory",
  "Weaving & Looms",
  "Dyeing & Printing",
  "Cutting & Tailoring",
  "Quality Inspection",
  "Packaging & Dispatch",
  "Administration & HR",
];

export const EmployeesPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const canManage = hasPermission("employees:manage");
  const canViewAll = hasPermission("employees:view");

  const [tab, setTab] = useState<"directory" | "tasks" | "my_tasks" | "my_activity">(
    canViewAll ? "directory" : "my_tasks"
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [myTasks, setMyTasks] = useState<EmployeeTask[]>([]);
  const [myActivity, setMyActivity] = useState<AuditLog[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: number; name: string; display_name: string }>>([]);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [empOpen, setEmpOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("Sales");
  const [joiningDate, setJoiningDate] = useState(todayISO());
  const [salary, setSalary] = useState("15000");
  const [createLogin, setCreateLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState("EMPLOYEE");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskEmpId, setTaskEmpId] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskDue, setTaskDue] = useState("");

  // Edit Employee State
  const [editEmpOpen, setEditEmpOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editSalary, setEditSalary] = useState("0");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editNotes, setEditNotes] = useState("");

  const loadData = useCallback(async () => {
    try {
      if (canViewAll) {
        const promises: Promise<unknown>[] = [
          api.get<Employee[]>("/employees"),
          api.get<EmployeeTask[]>("/employees/tasks"),
        ];
        if (canManage) {
          promises.push(api.get<Array<{ id: number; name: string; display_name: string }>>("/users/roles").catch(() => ({ data: [] })));
        }
        const results = await Promise.all(promises);
        const empRes = results[0] as { data: Employee[] };
        const tRes = results[1] as { data: EmployeeTask[] };
        setEmployees(empRes.data);
        setTasks(tRes.data);
        if (empRes.data.length > 0) setTaskEmpId((prev) => prev || empRes.data[0].id);

        if (results[2]) {
          const rolesRes = results[2] as { data: Array<{ id: number; name: string; display_name: string }> };
          setAvailableRoles(rolesRes.data || []);
        }
      }
      const [mtRes, actRes] = await Promise.all([
        api.get<EmployeeTask[]>("/employees/my-tasks"),
        api.get<PaginatedResponse<AuditLog>>("/audit/my-activity?page_size=25"),
      ]);
      setMyTasks(mtRes.data);
      setMyActivity(actRes.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [canViewAll, canManage]);

  const allDepartments = useMemo(() => {
    const deptSet = new Set(DEFAULT_DEPARTMENTS);
    employees.forEach((e) => {
      if (e.department?.trim()) deptSet.add(e.department.trim());
    });
    return Array.from(deptSet).sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (!selectedDepartmentFilter) return employees;
    return employees.filter((e) => e.department === selectedDepartmentFilter);
  }, [employees, selectedDepartmentFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/employees", {
        full_name: fullName,
        mobile,
        email: email || null,
        designation,
        department,
        joining_date: joiningDate,
        salary: Number(salary),
        create_login_account: createLogin,
        username: createLogin ? username : null,
        password: createLogin ? password : null,
        role_name: roleName,
      });
      setEmpOpen(false);
      setFullName("");
      setMobile("");
      setEmail("");
      setUsername("");
      setPassword("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEditFullName(emp.full_name);
    setEditMobile(emp.mobile);
    setEditEmail(emp.email || "");
    setEditDesignation(emp.designation);
    setEditDepartment(emp.department || "");
    setEditSalary(String(emp.salary || 0));
    setEditStatus(emp.status);
    setEditNotes(emp.notes || "");
    setEditEmpOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setError(null);
    try {
      await api.patch(`/employees/${editingEmp.id}`, {
        full_name: editFullName,
        mobile: editMobile,
        email: editEmail || null,
        designation: editDesignation,
        department: editDepartment || null,
        salary: Number(editSalary),
        status: editStatus,
        notes: editNotes || null,
      });
      setEditEmpOpen(false);
      setEditingEmp(null);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/employees/tasks", {
        employee_id: Number(taskEmpId),
        title: taskTitle,
        description: taskDesc || null,
        priority: taskPriority,
        due_date: taskDue || null,
      });
      setTaskOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    await api.patch(`/employees/tasks/${taskId}`, { status });
    await loadData();
  };

  const handleDeactivateEmployee = async (emp: Employee) => {
    if (!window.confirm(`Deactivate employee '${emp.full_name}'?`)) return;
    await api.delete(`/employees/${emp.id}`);
    await loadData();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Employee & Task Management</h2>
          <p className="text-xs text-slate-500">Staff directory, salaries, login access, task assignments, and personal activity history</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => setTaskOpen(true)} className="btn-secondary">
              <ClipboardList className="h-4 w-4" /> Assign Task
            </button>
            <button onClick={() => setEmpOpen(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Employee
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {canViewAll && (
          <>
            <button onClick={() => setTab("directory")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "directory" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
              Staff Directory ({employees.length})
            </button>
            <button onClick={() => setTab("tasks")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "tasks" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
              Assigned Tasks ({tasks.length})
            </button>
          </>
        )}
        <button onClick={() => setTab("my_tasks")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "my_tasks" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
          My Assigned Tasks ({myTasks.length})
        </button>
        <button onClick={() => setTab("my_activity")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "my_activity" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
          My Activity History
        </button>
      </div>

      {tab === "directory" && canViewAll && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Filter by Department:</label>
              <select
                value={selectedDepartmentFilter}
                onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                className="input-field text-xs py-1.5 px-3 w-auto bg-slate-50 border-slate-200"
              >
                <option value="">All Departments ({employees.length})</option>
                {allDepartments.map((dept) => {
                  const count = employees.filter((e) => e.department === dept).length;
                  return (
                    <option key={dept} value={dept}>
                      {dept} {count > 0 ? `(${count})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              Showing {filteredEmployees.length} of {employees.length} employees
            </p>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-left">Designation / Dept</th>
                    <th className="px-4 py-3 text-left">Login Role</th>
                    <th className="px-4 py-3 text-left">Joining Date</th>
                    <th className="px-4 py-3 text-right">Salary</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState title="No employees found in this view" /></td></tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs text-navy-900">{emp.full_name}</p>
                        <p className="text-[11px] text-slate-400">{emp.employee_code} • {emp.mobile}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{emp.designation} {emp.department ? `(${emp.department})` : ""}</td>
                      <td className="px-4 py-3 text-xs">
                        {emp.username ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-navy-900">
                            @{emp.username} <span className="text-[10px] bg-navy-50 text-navy-700 px-1.5 py-0.5 rounded font-bold uppercase">{emp.role_name}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Staff (No Login)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(emp.joining_date)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">{formatINR(emp.salary)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={emp.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (
                            <button
                              onClick={() => openEditEmployee(emp)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-navy-900 transition-colors"
                              title="Edit Employee"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          {canManage && emp.status === "ACTIVE" && (
                            <button
                              onClick={() => handleDeactivateEmployee(emp)}
                              className="p-1.5 rounded hover:bg-rose-50 text-rose-600 transition-colors"
                              title="Deactivate Employee"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(tab === "tasks" || tab === "my_tasks") && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Task</th>
                  <th className="px-4 py-3 text-left">Assignee</th>
                  <th className="px-4 py-3 text-center">Priority</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(tab === "tasks" ? tasks : myTasks).length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="No tasks assigned" /></td></tr>
                ) : (
                  (tab === "tasks" ? tasks : myTasks).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs text-navy-900">{t.title}</p>
                        <p className="text-[11px] text-slate-500">{t.description || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{t.employee_name}</td>
                      <td className="px-4 py-3 text-center text-xs font-semibold">{t.priority}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.due_date)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== "COMPLETED" && (
                          <button
                            onClick={() => handleUpdateTaskStatus(t.id, t.status === "PENDING" ? "IN_PROGRESS" : "COMPLETED")}
                            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t.status === "PENDING" ? "Start" : "Mark Done"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "my_activity" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Module</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myActivity.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold uppercase">{a.module}</td>
                    <td className="px-4 py-2.5 text-xs">{a.action}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{a.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={empOpen} onClose={() => setEmpOpen(false)} title="Add Employee" maxWidthClass="max-w-2xl">
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label-text">Full Name *</label><input required className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div><label className="label-text">Mobile *</label><input required className="input-field" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="label-text">Designation *</label><input required className="input-field" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Sales Executive" /></div>
            <div>
              <label className="label-text">Department</label>
              <input className="input-field" list="departments-list" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Select or type department" />
            </div>
            <div><label className="label-text">Joining Date</label><input type="date" required className="input-field" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label-text">Monthly Salary (₹)</label><input type="number" className="input-field" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
            <div><label className="label-text">Email</label><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          {/* Login Account Choice */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <label className="text-xs font-bold text-navy-900 block">System Access & Software Login</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className={`p-3 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition ${
                !createLogin ? "border-navy-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50"
              }`}>
                <input
                  type="radio"
                  name="loginChoice"
                  checked={!createLogin}
                  onChange={() => setCreateLogin(false)}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-bold text-navy-900">Staff Record Only (No Login)</p>
                  <p className="text-[11px] text-slate-500">For Tailors, Helpers, Warehouse, Delivery & Folding staff. No username or password needed.</p>
                </div>
              </label>

              <label className={`p-3 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition ${
                createLogin ? "border-navy-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50"
              }`}>
                <input
                  type="radio"
                  name="loginChoice"
                  checked={createLogin}
                  onChange={() => setCreateLogin(true)}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-bold text-navy-900">Create ERP Login Account</p>
                  <p className="text-[11px] text-slate-500">For Cashiers, Billing desk, Accounts & Sales staff who use the computer.</p>
                </div>
              </label>
            </div>

            {createLogin && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="label-text">Username *</label>
                  <input required className="input-field bg-white" placeholder="e.g. karthik.sales" value={username} onChange={(e) => setUsername(e.target.value.trim())} />
                </div>
                <div>
                  <label className="label-text">Password *</label>
                  <input type="password" minLength={8} required className="input-field bg-white" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div>
                  <label className="label-text">Assigned Role</label>
                  <select className="input-field bg-white" value={roleName} onChange={(e) => setRoleName(e.target.value)}>
                    {availableRoles.length > 0 ? (
                      availableRoles
                        .filter((r) => r.name !== "OWNER")
                        .map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.display_name} ({r.name})
                          </option>
                        ))
                    ) : (
                      <>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="SALES">Sales Counter</option>
                        <option value="ACCOUNTS">Accounts</option>
                        <option value="ADMIN">Admin</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEmpOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Employee</button>
          </div>
        </form>
      </Modal>

      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="Assign Employee Task" maxWidthClass="max-w-lg">
        <form onSubmit={handleAssignTask} className="space-y-4">
          <div>
            <label className="label-text">Employee</label>
            <select className="input-field" value={taskEmpId} onChange={(e) => setTaskEmpId(Number(e.target.value))}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.designation})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Task Title *</label>
            <input required className="input-field" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Verify Silk Saree Stock Rack B" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Priority</label>
              <select className="input-field" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label-text">Due Date</label>
              <input type="date" className="input-field" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-text">Instructions</label>
            <textarea rows={2} className="input-field" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTaskOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Assign Task</button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal open={editEmpOpen} onClose={() => setEditEmpOpen(false)} title={`Edit Employee: ${editingEmp?.full_name || ""}`}>
        <form onSubmit={handleUpdateEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Full Name *</label>
              <input required className="input-field" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Mobile *</label>
              <input required className="input-field" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Designation *</label>
              <input required className="input-field" value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Department</label>
              <input className="input-field" list="departments-list" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} placeholder="Select or type department" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Monthly Salary (₹)</label>
              <input type="number" className="input-field" value={editSalary} onChange={(e) => setEditSalary(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Status</label>
              <select className="input-field" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">Email</label>
            <input type="email" className="input-field" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Notes</label>
            <textarea rows={2} className="input-field" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditEmpOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      {/* Dynamic Textile Departments Datalist */}
      <datalist id="departments-list">
        {allDepartments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </div>
  );
};
