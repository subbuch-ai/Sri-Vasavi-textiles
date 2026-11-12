import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, UserX } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { AuditLog } from "../types/auth";
import { Employee, EmployeeTask, PaginatedResponse } from "../types/erp";
import { formatDate, formatINR, todayISO } from "../utils/formatters";

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
  const [error, setError] = useState<string | null>(null);

  const [empOpen, setEmpOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("Sales");
  const [joiningDate, setJoiningDate] = useState(todayISO());
  const [salary, setSalary] = useState("15000");
  const [createLogin, setCreateLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState("EMPLOYEE");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskEmpId, setTaskEmpId] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskDue, setTaskDue] = useState("");

  const loadData = useCallback(async () => {
    try {
      if (canViewAll) {
        const [empRes, tRes] = await Promise.all([
          api.get<Employee[]>("/employees"),
          api.get<EmployeeTask[]>("/employees/tasks"),
        ]);
        setEmployees(empRes.data);
        setTasks(tRes.data);
        if (empRes.data.length > 0) setTaskEmpId((prev) => prev || empRes.data[0].id);
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
  }, [canViewAll]);

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
                {employees.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No employees added yet" /></td></tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs text-navy-900">{emp.full_name}</p>
                        <p className="text-[11px] text-slate-400">{emp.employee_code} • {emp.mobile}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{emp.designation} {emp.department ? `(${emp.department})` : ""}</td>
                      <td className="px-4 py-3 text-xs">{emp.username ? `${emp.username} (${emp.role_name})` : "No login"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(emp.joining_date)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold">{formatINR(emp.salary)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={emp.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {canManage && emp.status === "ACTIVE" && (
                          <button onClick={() => handleDeactivateEmployee(emp)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Deactivate">
                            <UserX className="h-4 w-4" />
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
            <div><label className="label-text">Department</label><input className="input-field" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
            <div><label className="label-text">Joining Date</label><input type="date" required className="input-field" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label-text">Monthly Salary (₹)</label><input type="number" className="input-field" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
            <div><label className="label-text">Email</label><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-navy-900">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} className="rounded" />
            Create ERP Login Account for this employee
          </label>
          {createLogin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-3 rounded-lg">
              <div><label className="label-text">Username</label><input required className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
              <div><label className="label-text">Password</label><input type="password" minLength={8} required className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div>
                <label className="label-text">Role</label>
                <select className="input-field" value={roleName} onChange={(e) => setRoleName(e.target.value)}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="SALES">Sales</option>
                  <option value="ACCOUNTS">Accounts</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
          )}
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
    </div>
  );
};
