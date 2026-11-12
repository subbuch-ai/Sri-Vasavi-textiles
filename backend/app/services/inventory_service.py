from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.inventory import BranchStock, Product, StockTransaction
from app.models.organization import Branch, BusinessSettings, Notification
from app.services.numbering_service import generate_sequential_code


def get_default_branch_id(db: Session) -> int:
    branch = db.scalar(select(Branch).where(Branch.is_default.is_(True), Branch.is_active.is_(True)))
    if not branch:
        branch = db.scalar(select(Branch).where(Branch.is_active.is_(True)).order_by(Branch.id))
    if not branch:
        branch = Branch(
            code="MAIN",
            name="Sri Vasavi Textiles - Main Store & Warehouse",
            is_default=True,
            is_active=True,
        )
        db.add(branch)
        db.flush()
    return branch.id


def _get_or_create_branch_stock(db: Session, branch_id: int, product_id: int) -> BranchStock:
    bs = db.scalar(
        select(BranchStock)
        .where(BranchStock.branch_id == branch_id, BranchStock.product_id == product_id)
        .with_for_update()
    )
    if not bs:
        bs = BranchStock(branch_id=branch_id, product_id=product_id, quantity=Decimal("0.000"))
        db.add(bs)
        db.flush()
    return bs


def apply_stock_movement(
    db: Session,
    *,
    product_id: int,
    branch_id: Optional[int],
    transaction_type: str,
    quantity_change: Decimal,
    unit_cost: Optional[Decimal] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    reference_number: Optional[str] = None,
    notes: Optional[str] = None,
    user_id: Optional[int] = None,
    target_branch_id: Optional[int] = None,
) -> StockTransaction:
    """
    Atomically adjust product stock and branch stock inside an active DB transaction.
    Enforces BusinessSettings.allow_negative_stock before committing.
    """
    resolved_branch_id = branch_id or get_default_branch_id(db)

    product = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if not product:
        raise NotFoundError(f"Product #{product_id} not found.")

    settings_row = db.scalar(select(BusinessSettings).limit(1))
    allow_negative = settings_row.allow_negative_stock if settings_row else False

    stock_before = Decimal(product.current_stock)
    stock_after = stock_before + Decimal(quantity_change)

    if not allow_negative and stock_after < Decimal("0.000"):
        raise ValidationError(
            f"Insufficient stock for '{product.name}' ({product.product_code}). "
            f"Available: {stock_before} {product.unit}, Requested change: {quantity_change} {product.unit}."
        )

    branch_stock = _get_or_create_branch_stock(db, resolved_branch_id, product.id)
    branch_after = Decimal(branch_stock.quantity) + Decimal(quantity_change)
    if not allow_negative and branch_after < Decimal("0.000") and branch_stock.quantity > Decimal("0.000"):
        raise ValidationError(
            f"Insufficient branch stock for '{product.name}' in branch #{resolved_branch_id}. "
            f"Available: {branch_stock.quantity} {product.unit}."
        )

    product.current_stock = stock_after
    branch_stock.quantity = branch_after

    tx = StockTransaction(
        transaction_number=generate_sequential_code(db, StockTransaction, "transaction_number", "STK-", 6),
        product_id=product.id,
        branch_id=resolved_branch_id,
        target_branch_id=target_branch_id,
        transaction_type=transaction_type,
        quantity_change=quantity_change,
        stock_before=stock_before,
        stock_after=stock_after,
        unit_cost=unit_cost if unit_cost is not None else product.purchase_price,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        notes=notes,
        created_by=user_id,
    )
    db.add(tx)

    if (
        quantity_change < Decimal("0")
        and settings_row
        and settings_row.low_stock_alert_enabled
        and stock_after <= product.min_stock_level
    ):
        db.add(
            Notification(
                user_id=None,
                title=f"Low Stock Alert: {product.name}",
                message=f"Stock for {product.product_code} ({product.name}) dropped to {stock_after} {product.unit} (minimum: {product.min_stock_level}).",
                category="LOW_STOCK",
                link="/inventory",
            )
        )

    db.flush()
    return tx


def transfer_stock_between_branches(
    db: Session,
    *,
    product_id: int,
    source_branch_id: int,
    target_branch_id: int,
    quantity: Decimal,
    notes: Optional[str],
    user_id: Optional[int],
) -> StockTransaction:
    """Transfer stock between two active branches without changing total company stock."""
    if source_branch_id == target_branch_id:
        raise ValidationError("Source and target branches must be different.")
    if quantity <= Decimal("0"):
        raise ValidationError("Transfer quantity must be greater than zero.")

    source_branch = db.scalar(select(Branch).where(Branch.id == source_branch_id, Branch.is_active.is_(True)))
    target_branch = db.scalar(select(Branch).where(Branch.id == target_branch_id, Branch.is_active.is_(True)))
    if not source_branch or not target_branch:
        raise NotFoundError("Both source and target branches must exist and be active.")

    product = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if not product:
        raise NotFoundError("Product not found.")

    src_bs = _get_or_create_branch_stock(db, source_branch_id, product.id)
    tgt_bs = _get_or_create_branch_stock(db, target_branch_id, product.id)

    # If branch stock wasn't initialized yet for main branch while product has stock, sync main branch stock
    if src_bs.quantity == Decimal("0.000") and source_branch.is_default and product.current_stock > Decimal("0.000"):
        src_bs.quantity = product.current_stock

    settings_row = db.scalar(select(BusinessSettings).limit(1))
    allow_negative = settings_row.allow_negative_stock if settings_row else False

    if not allow_negative and src_bs.quantity < quantity:
        raise ValidationError(
            f"Insufficient stock in {source_branch.name}. Available: {src_bs.quantity} {product.unit}."
        )

    src_before = src_bs.quantity
    src_bs.quantity = src_bs.quantity - quantity
    tgt_bs.quantity = tgt_bs.quantity + quantity

    tx = StockTransaction(
        transaction_number=generate_sequential_code(db, StockTransaction, "transaction_number", "TRF-", 6),
        product_id=product.id,
        branch_id=source_branch_id,
        target_branch_id=target_branch_id,
        transaction_type="TRANSFER",
        quantity_change=Decimal("0.000"),
        stock_before=src_before,
        stock_after=src_bs.quantity,
        unit_cost=product.purchase_price,
        reference_type="STOCK_TRANSFER",
        reference_number=f"{source_branch.code}->{target_branch.code}",
        notes=notes or f"Transferred {quantity} {product.unit} from {source_branch.name} to {target_branch.name}",
        created_by=user_id,
    )
    db.add(tx)
    db.flush()
    return tx

