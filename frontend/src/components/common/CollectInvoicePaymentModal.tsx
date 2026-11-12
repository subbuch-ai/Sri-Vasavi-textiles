import React, { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../services/api";
import { Account } from "../../types/erp";
import { formatINR, todayISO } from "../../utils/formatters";
import { Modal } from "./Modal";
import { NumberInput } from "./NumberInput";
import { StatusBadge } from "./StatusBadge";

export interface PaymentSettlementTarget {
  partyType: "CUSTOMER" | "SUPPLIER";
  partyId: number;
  partyName: string;
  invoiceId?: number;
  invoiceNumber?: string;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount: number;
}

interface CollectInvoicePaymentModalProps {
  target: PaymentSettlementTarget | null;
  accounts: Account[];
  onClose: () => void;
  onSuccess: (message: string) => void | Promise<void>;
}

export const CollectInvoicePaymentModal: React.FC<CollectInvoicePaymentModalProps> = ({
  target,
  accounts,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [accountId, setAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setAmount(Number(target.pendingAmount) || 0);
      setPaymentDate(todayISO());
      setPaymentMode("CASH");
      setAccountId("");
      setReferenceNo(target.invoiceNumber || "");
      setNotes("");
      setModalError(null);
    }
  }, [target]);

  if (!target) return null;

  const isCustomer = target.partyType === "CUSTOMER";
  const remaining = Math.max(0, Number((target.pendingAmount - amount).toFixed(2)));
  const resultingStatus = remaining <= 0.005 ? "PAID" : amount > 0 ? "PARTIAL" : "UNPAID";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (amount <= 0) {
      setModalError("Enter a payment amount greater than 0.");
      return;
    }
    if (target.invoiceId && amount > target.pendingAmount + 0.001) {
      setModalError(`Amount cannot exceed pending invoice balance (${formatINR(target.pendingAmount)}).`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/payments", {
        payment_date: paymentDate,
        direction: isCustomer ? "INBOUND" : "OUTBOUND",
        party_type: target.partyType,
        customer_id: isCustomer ? target.partyId : null,
        supplier_id: !isCustomer ? target.partyId : null,
        sale_id: isCustomer && target.invoiceId ? target.invoiceId : null,
        purchase_invoice_id: !isCustomer && target.invoiceId ? target.invoiceId : null,
        account_id: accountId ? Number(accountId) : null,
        amount,
        payment_mode: paymentMode,
        reference_number: referenceNo || null,
        notes: notes || null,
      });
      const label = target.invoiceNumber ? `${target.invoiceNumber} status updated to ${resultingStatus}` : `Payment recorded for ${target.partyName}`;
      onClose();
      await onSuccess(`${label} (${formatINR(amount)}).`);
    } catch (err) {
      setModalError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={
        target.invoiceNumber
          ? `${isCustomer ? "Collect Invoice Payment" : "Pay Supplier Bill"} — ${target.invoiceNumber}`
          : `${isCustomer ? "Collect Customer Due" : "Pay Supplier Due"} — ${target.partyName}`
      }
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {modalError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
            {modalError}
          </div>
        )}

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="col-span-2 sm:col-span-1">
            <span className="text-slate-500 block">{isCustomer ? "Customer" : "Supplier"}</span>
            <span className="font-semibold text-navy-900 truncate block">{target.partyName}</span>
          </div>
          {target.totalAmount !== undefined && (
            <div>
              <span className="text-slate-500 block">Total</span>
              <span className="font-semibold text-slate-800">{formatINR(target.totalAmount)}</span>
            </div>
          )}
          {target.paidAmount !== undefined && (
            <div>
              <span className="text-slate-500 block">Already Paid</span>
              <span className="font-semibold text-emerald-700">{formatINR(target.paidAmount)}</span>
            </div>
          )}
          <div>
            <span className="text-slate-500 block">Pending Due</span>
            <span className="font-bold text-rose-700">{formatINR(target.pendingAmount)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label-text mb-0">Amount Paid (₹)</label>
              <div className="flex gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAmount(Number((target.pendingAmount / 2).toFixed(2)))}
                  className="text-navy-700 font-semibold hover:underline"
                >
                  Half
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setAmount(Number(target.pendingAmount))}
                  className="text-navy-700 font-semibold hover:underline"
                >
                  Full
                </button>
              </div>
            </div>
            <NumberInput className="input-field" value={amount} onValueChange={setAmount} />
          </div>
          <div>
            <label className="label-text">Payment Date</label>
            <input type="date" required className="input-field" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-text">Payment Mode</label>
            <select className="input-field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label className="label-text">{isCustomer ? "Deposit Account" : "Pay From Account"}</label>
            <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Auto Default</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-text">UTR / Cheque / Ref No</label>
            <input className="input-field" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional reference" />
          </div>
          <div>
            <label className="label-text">Notes</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Part payment / settlement" />
          </div>
        </div>

        {target.invoiceId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
            <span className="text-slate-600">
              Remaining balance after payment: <strong className="text-navy-900">{formatINR(remaining)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">New Status:</span>
              <StatusBadge status={resultingStatus} />
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save Payment & Update Status"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

