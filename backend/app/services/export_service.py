import csv
import io
from html import escape
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.organization import BusinessSettings
from app.models.sales import Sale


def build_invoice_pdf(sale: Sale, biz: BusinessSettings | None) -> bytes:
    """Generate a professional GST Tax Invoice / Receipt PDF for Sri Vasavi Textiles."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()
    elements: list[Any] = []

    biz_name = biz.business_name if biz else "SRI VASAVI TEXTILES"
    biz_addr = ", ".join(filter(None, [biz.address if biz else None, biz.city if biz else None, biz.state if biz else None, biz.pincode if biz else None]))
    biz_gst = f"GSTIN: {biz.gstin}" if biz and biz.gstin else "Wholesale & Retail Textile Trading"
    biz_contact = " | ".join(filter(None, [f"Ph: {biz.phone}" if biz and biz.phone else None, biz.email if biz and biz.email else None]))

    elements.append(Paragraph(f"<b><font size='16' color='#0e1e3a'>{biz_name.upper()}</font></b>", styles["Title"]))
    if biz_addr:
        elements.append(Paragraph(f"<font size='9' color='#475569'>{biz_addr}</font>", styles["Normal"]))
    elements.append(Paragraph(f"<font size='9' color='#475569'>{biz_gst} {(' | ' + biz_contact) if biz_contact else ''}</font>", styles["Normal"]))
    elements.append(Spacer(1, 6 * mm))

    cell_style = ParagraphStyle(
        "InvoiceCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
    )
    meta_style = ParagraphStyle(
        "InvoiceMetaCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )
    hsn_style = ParagraphStyle(
        "InvoiceHsnCell",
        parent=cell_style,
        alignment=1,
    )

    meta_data = [
        ["TAX INVOICE", f"Invoice No: {sale.invoice_number}"],
        [Paragraph(escape(f"Customer: {sale.customer_name_snapshot}"), meta_style), f"Date: {sale.sale_date.isoformat()}"],
        [f"Sale Type: {sale.sale_type}", f"Payment Status: {sale.payment_status} ({sale.payment_mode})"],
    ]
    meta_table = Table(meta_data, colWidths=[96 * mm, 86 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e1e3a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#ecc86b")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ("GRID", (0, 1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ]
        )
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 5 * mm))

    item_rows: List[List[Any]] = [["#", "Product", "HSN", "Qty", "Rate (INR)", "Disc", "GST %", "GST Amt", "Total (INR)"]]
    for idx, it in enumerate(sale.items, start=1):
        prod_name = it.product.name if it.product else f"Product #{it.product_id}"
        hsn = it.product.hsn_code if it.product and it.product.hsn_code else "-"
        item_rows.append(
            [
                str(idx),
                Paragraph(escape(prod_name), cell_style),
                Paragraph(escape(hsn), hsn_style),
                f"{float(it.quantity):g}",
                f"{float(it.unit_price):,.2f}",
                f"{float(it.discount_amount):,.2f}",
                f"{float(it.gst_rate):g}%",
                f"{float(it.gst_amount):,.2f}",
                f"{float(it.total_amount):,.2f}",
            ]
        )

    item_table = Table(
        item_rows,
        colWidths=[8 * mm, 56 * mm, 16 * mm, 13 * mm, 20 * mm, 14 * mm, 14 * mm, 19 * mm, 22 * mm],
        repeatRows=1,
    )
    item_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1b3664")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (2, 0), (2, -1), "CENTER"),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                ("VALIGN", (0, 1), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(item_table)
    elements.append(Spacer(1, 5 * mm))

    totals_rows = [
        ["Subtotal (Taxable Value)", f"Rs. {float(sale.subtotal):,.2f}"],
        ["Invoice Discount", f"Rs. {float(sale.discount_amount):,.2f}"],
        ["CGST", f"Rs. {float(sale.cgst_amount):,.2f}"],
        ["SGST", f"Rs. {float(sale.sgst_amount):,.2f}"],
        ["IGST", f"Rs. {float(sale.igst_amount):,.2f}"],
        ["Round Off", f"Rs. {float(sale.round_off):,.2f}"],
        ["Grand Total", f"Rs. {float(sale.total_amount):,.2f}"],
        ["Paid Amount", f"Rs. {float(sale.paid_amount):,.2f}"],
        ["Balance Pending", f"Rs. {float(sale.pending_amount):,.2f}"],
    ]
    totals_table = Table(totals_rows, colWidths=[130 * mm, 52 * mm])
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 6), (-1, 6), "Helvetica-Bold"),
                ("BACKGROUND", (0, 6), (-1, 6), colors.HexColor("#fdf8e8")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(totals_table)
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph("<font size='8' color='#64748b'>Thank you for your business with Sri Vasavi Textiles. Subject to local jurisdiction.</font>", styles["Normal"]))

    doc.build(elements)
    return buffer.getvalue()


def export_report_pdf(report: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    cols: List[str] = report["columns"]
    page_size = landscape(A4) if len(cols) > 6 else A4
    doc = SimpleDocTemplate(buffer, pagesize=page_size, rightMargin=10 * mm, leftMargin=10 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    elements: list[Any] = [
        Paragraph(f"<b><font size='14' color='#0e1e3a'>SRI VASAVI TEXTILES — {report['title']}</font></b>", styles["Title"]),
        Paragraph(f"<font size='9' color='#475569'>Period: {report['period']}</font>", styles["Normal"]),
        Spacer(1, 4 * mm),
    ]

    table_data = [cols]
    for r in report["rows"]:
        table_data.append([str(r.get(c, "")) for c in cols])

    if len(table_data) == 1:
        table_data.append(["No records found for this filter." if i == 0 else "" for i in range(len(cols))])

    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e1e3a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()


def export_report_excel(report: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = report["report_type"][:31]

    ws.append(["SRI VASAVI TEXTILES", report["title"]])
    ws.append(["Period", report["period"]])
    ws.append([])

    cols: List[str] = report["columns"]
    ws.append(cols)
    header_row = ws.max_row
    header_fill = PatternFill(start_color="0E1E3A", end_color="0E1E3A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    for col_idx in range(1, len(cols) + 1):
        cell = ws.cell(row=header_row, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for r in report["rows"]:
        ws.append([r.get(c, "") for c in cols])

    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def export_report_csv(report: Dict[str, Any]) -> bytes:
    out = io.StringIO()
    cols: List[str] = report["columns"]
    writer = csv.DictWriter(out, fieldnames=cols)
    writer.writeheader()
    for r in report["rows"]:
        writer.writerow({c: r.get(c, "") for c in cols})
    return out.getvalue().encode("utf-8-sig")


def build_customer_statement_report_dict(customer: Any, ledger_entries: List[Any]) -> Dict[str, Any]:
    """Structured single-customer debit/credit/outstanding statement for UI & Excel/CSV export."""
    total_debit = sum(float(e.debit) for e in ledger_entries)
    total_credit = sum(float(e.credit) for e in ledger_entries)
    rows: List[Dict[str, Any]] = [
        {
            "Date": e.date.isoformat() if hasattr(e.date, "isoformat") else str(e.date),
            "Reference": e.reference,
            "Type": e.entry_type,
            "Description": e.description,
            "Debit (Billed)": round(float(e.debit), 2),
            "Credit (Paid)": round(float(e.credit), 2),
            "Balance": round(float(e.balance), 2),
        }
        for e in ledger_entries
    ]
    rows.append(
        {
            "Date": "",
            "Reference": "TOTAL",
            "Type": "",
            "Description": f"Customer: {customer.name} ({customer.customer_code}) | Mobile: {customer.mobile} | Credit Limit: {float(customer.credit_limit):,.2f}",
            "Debit (Billed)": round(total_debit, 2),
            "Credit (Paid)": round(total_credit, 2),
            "Balance": round(float(customer.outstanding_balance), 2),
        }
    )
    return {
        "report_type": "customer_statement",
        "title": f"Customer Account Statement — {customer.name} ({customer.customer_code})",
        "period": f"Mobile: {customer.mobile} | Type: {customer.customer_type}" + (f" | GSTIN: {customer.gst_number}" if customer.gst_number else ""),
        "summary": {
            "customer_name": customer.name,
            "customer_code": customer.customer_code,
            "customer_type": customer.customer_type,
            "mobile": customer.mobile,
            "opening_balance": round(float(customer.opening_balance), 2),
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "outstanding_balance": round(float(customer.outstanding_balance), 2),
        },
        "columns": ["Date", "Reference", "Type", "Description", "Debit (Billed)", "Credit (Paid)", "Balance"],
        "rows": rows,
    }


def build_customer_statement_pdf(customer: Any, ledger_entries: List[Any], biz: BusinessSettings | None) -> bytes:
    """Generate a single-customer A4 PDF statement with full profile, debits, credits, running balance, and totals."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()
    elements: list[Any] = []

    biz_name = biz.business_name if biz else "SRI VASAVI TEXTILES"
    biz_addr = ", ".join(filter(None, [biz.address if biz else None, biz.city if biz else None, biz.state if biz else None, biz.pincode if biz else None]))
    biz_gst = f"GSTIN: {biz.gstin}" if biz and biz.gstin else "Wholesale & Retail Textile Trading"

    elements.append(Paragraph(f"<b><font size='16' color='#0e1e3a'>{escape(biz_name.upper())}</font></b>", styles["Title"]))
    if biz_addr:
        elements.append(Paragraph(f"<font size='9' color='#475569'>{escape(biz_addr)}</font>", styles["Normal"]))
    elements.append(Paragraph(f"<font size='9' color='#475569'>{escape(biz_gst)}</font>", styles["Normal"]))
    elements.append(Spacer(1, 5 * mm))

    info_style = ParagraphStyle("CustInfo", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11)
    cell_style = ParagraphStyle("StmtCell", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=10)

    loc = ", ".join(filter(None, [customer.city, customer.state])) or "-"
    outst = float(customer.outstanding_balance)
    outst_label = f"Rs. {outst:,.2f}" + (" (Advance Credit)" if outst < 0 else " (Due Receivable)" if outst > 0 else " (Settled)")

    total_debit = sum(float(e.debit) for e in ledger_entries)
    total_credit = sum(float(e.credit) for e in ledger_entries)

    meta_rows = [
        ["CUSTOMER ACCOUNT STATEMENT", f"Code: {customer.customer_code}"],
        [
            Paragraph(escape(f"Customer: {customer.name} ({customer.customer_type})"), info_style),
            Paragraph(escape(f"Mobile: {customer.mobile}" + (f" | Email: {customer.email}" if customer.email else "")), info_style),
        ],
        [
            Paragraph(escape(f"Address / City: {customer.address or loc}"), info_style),
            Paragraph(escape(f"GSTIN: {customer.gst_number or '-'} | Credit Limit: Rs. {float(customer.credit_limit):,.2f}"), info_style),
        ],
        [
            Paragraph(escape(f"Opening Balance: Rs. {float(customer.opening_balance):,.2f}"), info_style),
            Paragraph(escape(f"Current Outstanding: {outst_label}"), info_style),
        ],
    ]
    meta_table = Table(meta_rows, colWidths=[96 * mm, 86 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e1e3a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#ecc86b")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ("GRID", (0, 1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ]
        )
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 5 * mm))

    tx_rows: List[List[Any]] = [
        ["Date", "Reference", "Type", "Description", "Debit (Dr)", "Credit (Cr)", "Balance"],
    ]
    for e in ledger_entries:
        dt_str = e.date.isoformat() if hasattr(e.date, "isoformat") else str(e.date)
        tx_rows.append(
            [
                dt_str,
                Paragraph(escape(str(e.reference)), cell_style),
                e.entry_type,
                Paragraph(escape(str(e.description)), cell_style),
                f"{float(e.debit):,.2f}" if float(e.debit) else "-",
                f"{float(e.credit):,.2f}" if float(e.credit) else "-",
                f"{float(e.balance):,.2f}",
            ]
        )
    if not ledger_entries:
        tx_rows.append(["-", "-", "-", Paragraph("No ledger transactions recorded.", cell_style), "0.00", "0.00", f"{outst:,.2f}"])

    tx_rows.append(
        [
            "",
            "TOTAL",
            "",
            Paragraph("Closing Total (Billed Dr / Paid Cr / Outstanding)", cell_style),
            f"{total_debit:,.2f}",
            f"{total_credit:,.2f}",
            f"{outst:,.2f}",
        ]
    )

    stmt_table = Table(
        tx_rows,
        colWidths=[20 * mm, 26 * mm, 18 * mm, 52 * mm, 22 * mm, 22 * mm, 22 * mm],
        repeatRows=1,
    )
    stmt_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1b3664")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                ("VALIGN", (0, 1), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fdf8e8")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ]
        )
    )
    elements.append(stmt_table)
    doc.build(elements)
    return buffer.getvalue()


