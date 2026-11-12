from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, get_current_user, require_any_permission, require_permission
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.rbac import ROLE_OWNER
from app.core.security import hash_password
from app.models.auth import Role, User
from app.models.hr import Employee, EmployeeTask
from app.schemas.common import MessageResponse
from app.schemas.hr import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeTaskCreate,
    EmployeeTaskOut,
    EmployeeTaskUpdate,
    EmployeeUpdate,
)
from app.services.audit_service import record_audit_log
from app.services.inventory_service import get_default_branch_id
from app.services.numbering_service import generate_sequential_code

router = APIRouter(prefix="/employees", tags=["Employees & Tasks"])


def _to_employee_out(emp: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=emp.id,
        employee_code=emp.employee_code,
        user_id=emp.user_id,
        username=emp.user.username if emp.user else None,
        role_name=emp.user.role.name if emp.user and emp.user.role else None,
        branch_id=emp.branch_id,
        full_name=emp.full_name,
        mobile=emp.mobile,
        email=emp.email,
        designation=emp.designation,
        department=emp.department,
        joining_date=emp.joining_date,
        salary=emp.salary,
        status=emp.status,
        address=emp.address,
        notes=emp.notes,
        created_at=emp.created_at,
    )


@router.get("", response_model=List[EmployeeOut])
def list_employees(
    status: Optional[str] = None,
    _: User = Depends(require_permission("employees:view")),
    db: Session = Depends(get_db),
) -> List[EmployeeOut]:
    stmt = select(Employee).options(joinedload(Employee.user).joinedload(User.role))
    if status:
        stmt = stmt.where(Employee.status == status)
    rows = db.scalars(stmt.order_by(desc(Employee.id))).all()
    return [_to_employee_out(e) for e in rows]


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    request: Request,
    user: User = Depends(require_permission("employees:manage")),
    db: Session = Depends(get_db),
) -> EmployeeOut:
    code = (
        payload.employee_code.strip().upper()
        if payload.employee_code
        else generate_sequential_code(db, Employee, "employee_code", "SVT-EMP-", 4)
    )
    if db.scalar(select(Employee.id).where(Employee.employee_code == code)):
        raise ConflictError(f"Employee code '{code}' already exists.")

    linked_user_id: Optional[int] = None
    if payload.create_login_account:
        if not payload.username or not payload.password:
            raise ValidationError("Username and password are required when creating a login account.")
        uname = payload.username.strip().lower()
        email = (str(payload.email).lower() if payload.email else f"{uname}@srivasavitextiles.com")
        if db.scalar(select(User.id).where(User.username == uname)):
            raise ConflictError(f"Username '{uname}' already exists.")
        if db.scalar(select(User.id).where(User.email == email)):
            raise ConflictError(f"Email '{email}' already exists.")
        role = db.scalar(select(Role).where(Role.name == payload.role_name.strip().upper()))
        if not role or role.name == ROLE_OWNER:
            raise ValidationError("Invalid staff role selected.")

        new_user = User(
            username=uname,
            email=email,
            full_name=payload.full_name.strip(),
            mobile=payload.mobile.strip(),
            password_hash=hash_password(payload.password),
            role_id=role.id,
            is_active=payload.status == "ACTIVE",
            is_owner=False,
        )
        db.add(new_user)
        db.flush()
        linked_user_id = new_user.id

    emp = Employee(
        employee_code=code,
        user_id=linked_user_id,
        branch_id=payload.branch_id or get_default_branch_id(db),
        full_name=payload.full_name.strip(),
        mobile=payload.mobile.strip(),
        email=str(payload.email).lower() if payload.email else None,
        designation=payload.designation.strip(),
        department=payload.department,
        joining_date=payload.joining_date,
        salary=payload.salary,
        status=payload.status,
        address=payload.address,
        notes=payload.notes,
    )
    db.add(emp)
    db.flush()
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="CREATE",
        module="employees",
        entity_type="employee",
        entity_id=emp.id,
        description=f"Added employee '{emp.full_name}' ({emp.employee_code}).",
        ip_address=get_client_ip(request),
    )
    db.commit()
    loaded = db.scalar(
        select(Employee).options(joinedload(Employee.user).joinedload(User.role)).where(Employee.id == emp.id)
    )
    return _to_employee_out(loaded)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    request: Request,
    user: User = Depends(require_permission("employees:manage")),
    db: Session = Depends(get_db),
) -> EmployeeOut:
    emp = db.scalar(
        select(Employee).options(joinedload(Employee.user).joinedload(User.role)).where(Employee.id == employee_id)
    )
    if not emp:
        raise NotFoundError("Employee not found.")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(emp, k, v)
    if emp.user and "status" in updates:
        emp.user.is_active = updates["status"] == "ACTIVE"

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE",
        module="employees",
        entity_type="employee",
        entity_id=emp.id,
        description=f"Updated employee '{emp.full_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(emp)
    return _to_employee_out(emp)


@router.delete("/{employee_id}", response_model=MessageResponse)
def deactivate_employee(
    employee_id: int,
    request: Request,
    user: User = Depends(require_permission("employees:manage")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    emp = db.scalar(select(Employee).options(joinedload(Employee.user)).where(Employee.id == employee_id))
    if not emp:
        raise NotFoundError("Employee not found.")
    emp.status = "INACTIVE"
    if emp.user:
        emp.user.is_active = False
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="DEACTIVATE",
        module="employees",
        entity_type="employee",
        entity_id=emp.id,
        description=f"Deactivated employee '{emp.full_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MessageResponse(message=f"Employee '{emp.full_name}' deactivated.")


@router.get("/tasks", response_model=List[EmployeeTaskOut])
def list_all_tasks(
    employee_id: Optional[int] = None,
    _: User = Depends(require_permission("employees:view")),
    db: Session = Depends(get_db),
) -> List[EmployeeTaskOut]:
    stmt = select(EmployeeTask).options(joinedload(EmployeeTask.employee))
    if employee_id:
        stmt = stmt.where(EmployeeTask.employee_id == employee_id)
    rows = db.scalars(stmt.order_by(desc(EmployeeTask.id))).all()
    return [
        EmployeeTaskOut(
            id=t.id,
            employee_id=t.employee_id,
            employee_name=t.employee.full_name if t.employee else None,
            assigned_by=t.assigned_by,
            title=t.title,
            description=t.description,
            module_ref=t.module_ref,
            record_ref=t.record_ref,
            priority=t.priority,
            status=t.status,
            due_date=t.due_date,
            completed_at=t.completed_at,
            completion_notes=t.completion_notes,
            created_at=t.created_at,
        )
        for t in rows
    ]


@router.get("/my-tasks", response_model=List[EmployeeTaskOut])
def list_my_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[EmployeeTaskOut]:
    emp = db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    if not emp:
        return []
    rows = db.scalars(
        select(EmployeeTask).where(EmployeeTask.employee_id == emp.id).order_by(desc(EmployeeTask.id))
    ).all()
    return [
        EmployeeTaskOut(
            id=t.id,
            employee_id=t.employee_id,
            employee_name=emp.full_name,
            assigned_by=t.assigned_by,
            title=t.title,
            description=t.description,
            module_ref=t.module_ref,
            record_ref=t.record_ref,
            priority=t.priority,
            status=t.status,
            due_date=t.due_date,
            completed_at=t.completed_at,
            completion_notes=t.completion_notes,
            created_at=t.created_at,
        )
        for t in rows
    ]


@router.post("/tasks", response_model=EmployeeTaskOut, status_code=201)
def assign_task(
    payload: EmployeeTaskCreate,
    request: Request,
    user: User = Depends(require_permission("employees:manage")),
    db: Session = Depends(get_db),
) -> EmployeeTaskOut:
    emp = db.scalar(select(Employee).where(Employee.id == payload.employee_id))
    if not emp:
        raise NotFoundError("Employee not found.")
    task = EmployeeTask(
        employee_id=emp.id,
        assigned_by=user.id,
        title=payload.title.strip(),
        description=payload.description,
        module_ref=payload.module_ref,
        record_ref=payload.record_ref,
        priority=payload.priority,
        status="PENDING",
        due_date=payload.due_date,
    )
    db.add(task)
    db.flush()
    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="ASSIGN_TASK",
        module="employees",
        entity_type="employee_task",
        entity_id=task.id,
        description=f"Assigned task '{task.title}' to '{emp.full_name}'.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(task)
    return EmployeeTaskOut(
        id=task.id,
        employee_id=task.employee_id,
        employee_name=emp.full_name,
        assigned_by=task.assigned_by,
        title=task.title,
        description=task.description,
        module_ref=task.module_ref,
        record_ref=task.record_ref,
        priority=task.priority,
        status=task.status,
        due_date=task.due_date,
        completed_at=task.completed_at,
        completion_notes=task.completion_notes,
        created_at=task.created_at,
    )


@router.patch("/tasks/{task_id}", response_model=EmployeeTaskOut)
def update_task_status(
    task_id: int,
    payload: EmployeeTaskUpdate,
    request: Request,
    user: User = Depends(require_any_permission(["employees:manage", "tasks:update_own"])),
    db: Session = Depends(get_db),
) -> EmployeeTaskOut:
    task = db.scalar(
        select(EmployeeTask).options(joinedload(EmployeeTask.employee)).where(EmployeeTask.id == task_id)
    )
    if not task:
        raise NotFoundError("Task not found.")

    if not user.is_owner and user.role.name not in ("OWNER", "ADMIN"):
        emp = db.scalar(select(Employee).where(Employee.user_id == user.id))
        if not emp or task.employee_id != emp.id:
            raise PermissionDeniedError("You can only update tasks assigned to yourself.")

    task.status = payload.status
    if payload.completion_notes is not None:
        task.completion_notes = payload.completion_notes
    if payload.status == "COMPLETED":
        task.completed_at = datetime.now(timezone.utc)

    record_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action="UPDATE_TASK",
        module="employees",
        entity_type="employee_task",
        entity_id=task.id,
        description=f"Updated task '{task.title}' status to {task.status}.",
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(task)
    return EmployeeTaskOut(
        id=task.id,
        employee_id=task.employee_id,
        employee_name=task.employee.full_name if task.employee else None,
        assigned_by=task.assigned_by,
        title=task.title,
        description=task.description,
        module_ref=task.module_ref,
        record_ref=task.record_ref,
        priority=task.priority,
        status=task.status,
        due_date=task.due_date,
        completed_at=task.completed_at,
        completion_notes=task.completion_notes,
        created_at=task.created_at,
    )

