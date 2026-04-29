import React, { useState } from "react";
import { DollarSign, FileText, Users, X } from "lucide-react";
import {
  COLLECTION_PURPOSES,
  COLLECTION_CURRENCIES,
  DEFAULT_BRANCHES,
  getAttendanceTotals,
  getDefaultExchangeRateToXcd,
  getDayOfWeek,
  getIncomeRowAmountXcd,
  SPECIAL_PROGRAMME_TYPES,
  STANDARD_SERVICE_TYPES,
  validateServiceRecord
} from "../reporting/serviceRecords";
import { Button, Card, formatLocalDateKey, InputGroup } from "./viewShared";

const BRANCH_OPTIONS = [...DEFAULT_BRANCHES];

export default function ReportForm({ initialData, userBranch, onSave, onCancel }) {
  const initialBranch =
    (initialData?.branch === "Headquarters" ? "Goodwill" : initialData?.branch) ||
    (userBranch === "Headquarters" ? "Goodwill" : userBranch) ||
    "Goodwill";
  const [date, setDate] = useState(
    initialData?.date || formatLocalDateKey(new Date())
  );
  const [serviceType, setServiceType] = useState(
    initialData?.serviceType === "Other Programme"
      ? "Special Programme"
      : initialData?.serviceType || "Sunday Worship Service"
  );
  const [otherServiceType, setOtherServiceType] = useState(
    initialData?.otherServiceType || ""
  );
  const [isSpecialProgramme, setIsSpecialProgramme] = useState(
    Boolean(
      initialData?.isSpecialProgramme ||
      initialData?.specialProgramme?.enabled ||
      initialData?.serviceType === "Other Programme"
    )
  );
  const [specialProgrammeName, setSpecialProgrammeName] = useState(
    initialData?.specialProgramme?.name ||
      initialData?.specialProgrammeName ||
      (initialData?.serviceType === "Other Programme" ? initialData?.otherServiceType : "") ||
      ""
  );
  const [specialProgrammeType, setSpecialProgrammeType] = useState(
    initialData?.specialProgramme?.type || initialData?.programmeType || "Gospel Campaign"
  );
  const [attendance, setAttendance] = useState({
    men: initialData?.attendance?.men || "",
    women: initialData?.attendance?.women || "",
    children: initialData?.attendance?.children || "",
    newVisitors:
      initialData?.newVisitors ??
      initialData?.attendance?.newVisitors ??
      ""
  });
  const [branch, setBranch] = useState(initialBranch);
  const [otherBranch, setOtherBranch] = useState(initialData?.otherBranch || "");
  const [incomeRows, setIncomeRows] = useState(
    initialData?.financials?.income || [
      {
        purpose: "Offering",
        label: "Offering",
        amount: "",
        currency: "XCD",
        exchangeRateToXcd: 1
      }
    ]
  );
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [saving, setSaving] = useState(false);
  const dayOfWeek = getDayOfWeek(date);
  const attendancePreview = getAttendanceTotals({
    attendance,
    newVisitors: attendance.newVisitors
  });

  const handleAttendanceChange = (field, value) => {
    setAttendance((prev) => ({ ...prev, [field]: value.replace(/[^0-9]/g, "") }));
  };

  const handleRowChange = (rows, setRows, index, field, value) => {
    const copy = [...rows];
    const nextRow = { ...copy[index], [field]: value };
    if (field === "currency") {
      nextRow.exchangeRateToXcd = getDefaultExchangeRateToXcd(value);
    }
    copy[index] = nextRow;
    setRows(copy);
  };

  const addRow = (
    rows,
    setRows,
    makeRow = () => ({
      label: "",
      amount: "",
      currency: "XCD",
      exchangeRateToXcd: 1
    })
  ) => {
    setRows([...rows, makeRow()]);
  };

  const removeRow = (
    rows,
    setRows,
    index,
    makeDefaultRow = () => ({
      label: "",
      amount: "",
      currency: "XCD",
      exchangeRateToXcd: 1
    })
  ) => {
    const copy = [...rows];
    copy.splice(index, 1);
    setRows(copy.length ? copy : [makeDefaultRow()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const validationError = validateServiceRecord({
        date,
        branch,
        otherBranch,
        serviceType,
        otherServiceType,
        attendance,
        newVisitors: attendance.newVisitors,
        incomeRows,
        isSpecialProgramme,
        specialProgrammeName
      });
      if (validationError) {
        alert(validationError);
        return;
      }
      const cleanIncome = incomeRows
        .map((r) => {
          const purpose = r.purpose || r.label || "Offering";
          const label =
            purpose === "Other"
              ? r.otherPurpose?.trim() || r.label?.trim() || "Other"
              : purpose;
          return {
            purpose,
            otherPurpose: r.otherPurpose?.trim() || "",
            label,
            amount: parseFloat(r.amount || 0) || 0,
            currency: r.currency || "XCD",
            exchangeRateToXcd: parseFloat(
              r.exchangeRateToXcd ?? getDefaultExchangeRateToXcd(r.currency || "XCD")
            ) || getDefaultExchangeRateToXcd(r.currency || "XCD"),
            amountXcd: getIncomeRowAmountXcd(r)
          };
        })
        .filter((r) => r.label || r.amount || r.amountXcd);
      const totalIncome = cleanIncome.reduce((sum, row) => sum + (row.amountXcd || 0), 0);
      const totalAttendance = attendancePreview.total;

      const payload = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        date,
        dayOfWeek,
        serviceType,
        otherServiceType: serviceType === "Other" ? otherServiceType.trim() : "",
        branch,
        otherBranch: branch === "Other" ? otherBranch : "",
        isSpecialProgramme,
        specialProgramme: {
          enabled: isSpecialProgramme,
          name: isSpecialProgramme ? specialProgrammeName.trim() : "",
          type: isSpecialProgramme ? specialProgrammeType : "",
          highlights: notes
        },
        attendance: {
          men: attendance.men || "0",
          women: attendance.women || "0",
          children: attendance.children || "0",
          newVisitors: attendance.newVisitors || "0"
        },
        newVisitors: attendance.newVisitors || "0",
        totalAttendance,
        financials: {
          income: cleanIncome,
          expenses: initialData?.financials?.expenses || [],
          totalIncome
        },
        totalIncome,
        notes
      };

      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  const totalIncome = incomeRows.reduce(
    (sum, r) => sum + getIncomeRowAmountXcd(r),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText className="text-blue-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {initialData?.id ? "Edit Service Report" : "New Service Report"}
            </h2>
            <p className="text-sm text-slate-500">
              Capture attendance and financial summary for this service.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <Card className="p-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <InputGroup label="Service Date">
              <input
                type="date"
                className="w-full border rounded px-3 py-3 text-base"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </InputGroup>
            <InputGroup label="Day of Week">
              <input
                className="w-full border rounded px-3 py-3 text-base bg-slate-50"
                value={dayOfWeek}
                readOnly
                aria-label="Day of week calculated from service date"
              />
            </InputGroup>
            <InputGroup label="Service Type">
              <select
                className="w-full border rounded px-3 py-3 text-base"
                value={serviceType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setServiceType(nextType);
                  if (
                    ["Special Programme", "Outreach", "Gospel Campaign", "Retreat", "Conference"].includes(
                      nextType
                    )
                  ) {
                    setIsSpecialProgramme(true);
                    setSpecialProgrammeType(nextType === "Special Programme" ? specialProgrammeType : nextType);
                  }
                }}
              >
                {STANDARD_SERVICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </InputGroup>
            {serviceType === "Other" && (
              <InputGroup label="Custom Service Label">
                <input
                  className="w-full border rounded px-3 py-3 text-base"
                  value={otherServiceType}
                  onChange={(e) => setOtherServiceType(e.target.value)}
                  placeholder="Enter service label"
                  required
                />
              </InputGroup>
            )}
            <InputGroup label="Branch">
              <select
                className="w-full border rounded px-3 py-3 text-base"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {BRANCH_OPTIONS.map((branchName) => (
                  <option key={branchName} value={branchName}>
                    {branchName}
                  </option>
                ))}
              </select>
            </InputGroup>
          </div>

          {branch === "Other" && (
            <InputGroup label="Specify Other Branch">
              <input
                className="w-full border rounded px-3 py-3 text-base"
                value={otherBranch}
                onChange={(e) => setOtherBranch(e.target.value)}
                placeholder="Enter branch name"
              />
            </InputGroup>
          )}

          <Card className="p-4 bg-slate-50 border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={isSpecialProgramme}
                  onChange={(e) => setIsSpecialProgramme(e.target.checked)}
                />
                Special programme / outreach
              </label>
              {isSpecialProgramme && (
                <span className="text-xs text-slate-500">
                  This will appear separately in the monthly highlights.
                </span>
              )}
            </div>
            {isSpecialProgramme && (
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <InputGroup label="Programme Name">
                  <input
                    className="w-full border rounded px-3 py-3 text-base"
                    value={specialProgrammeName}
                    onChange={(e) => setSpecialProgrammeName(e.target.value)}
                    placeholder="e.g. Gospel Campaign"
                    required={isSpecialProgramme}
                  />
                </InputGroup>
                <InputGroup label="Programme Type">
                  <select
                    className="w-full border rounded px-3 py-3 text-base"
                    value={specialProgrammeType}
                    onChange={(e) => setSpecialProgrammeType(e.target.value)}
                  >
                    {SPECIAL_PROGRAMME_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </InputGroup>
              </div>
            )}
          </Card>

          <Card className="p-4 bg-slate-50 border-slate-200">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Users size={18} className="text-blue-700" />
              Attendance
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <InputGroup label="Men">
                <input
                  className="w-full border rounded px-3 py-3 text-base"
                  value={attendance.men}
                  onChange={(e) => handleAttendanceChange("men", e.target.value)}
                  inputMode="numeric"
                />
              </InputGroup>
              <InputGroup label="Women">
                <input
                  className="w-full border rounded px-3 py-3 text-base"
                  value={attendance.women}
                  onChange={(e) => handleAttendanceChange("women", e.target.value)}
                  inputMode="numeric"
                />
              </InputGroup>
              <InputGroup label="Children">
                <input
                  className="w-full border rounded px-3 py-3 text-base"
                  value={attendance.children}
                  onChange={(e) => handleAttendanceChange("children", e.target.value)}
                  inputMode="numeric"
                />
              </InputGroup>
              <InputGroup label="New Visitors">
                <input
                  className="w-full border rounded px-3 py-3 text-base"
                  value={attendance.newVisitors}
                  onChange={(e) => handleAttendanceChange("newVisitors", e.target.value)}
                  inputMode="numeric"
                />
              </InputGroup>
              <div className="rounded border border-blue-100 bg-white px-3 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Total Attendance
                </p>
                <p className="text-2xl font-bold text-blue-900">
                  {attendancePreview.total}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="p-4 bg-slate-50 border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <DollarSign size={18} className="text-green-700" />
                  Income
                </h3>
                <span className="text-xs text-slate-500">
                  Total: XCD {totalIncome.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2">
                {incomeRows.map((row, idx) => (
                  <div key={idx} className="grid md:grid-cols-[1fr,1fr,110px,120px,110px,36px] gap-2">
                    <select
                      className="border rounded px-3 py-2 text-sm"
                      value={row.purpose || row.label || "Offering"}
                      onChange={(e) =>
                        handleRowChange(incomeRows, setIncomeRows, idx, "purpose", e.target.value)
                      }
                    >
                      {COLLECTION_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>
                          {purpose}
                        </option>
                      ))}
                    </select>
                    <input
                      className="border rounded px-3 py-2 text-sm"
                      placeholder={row.purpose === "Other" ? "Required details" : "Optional note"}
                      value={row.purpose === "Other" ? row.otherPurpose || "" : row.label || ""}
                      onChange={(e) =>
                        handleRowChange(
                          incomeRows,
                          setIncomeRows,
                          idx,
                          row.purpose === "Other" ? "otherPurpose" : "label",
                          e.target.value
                        )
                      }
                    />
                    <input
                      className="border rounded px-3 py-2 text-sm text-right"
                      placeholder="Amount"
                      value={row.amount}
                      onChange={(e) =>
                        handleRowChange(incomeRows, setIncomeRows, idx, "amount", e.target.value)
                      }
                    />
                    <select
                      className="border rounded px-3 py-2 text-sm"
                      value={row.currency || "XCD"}
                      onChange={(e) =>
                        handleRowChange(incomeRows, setIncomeRows, idx, "currency", e.target.value)
                      }
                    >
                      {COLLECTION_CURRENCIES.map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                    <input
                      className="border rounded px-3 py-2 text-sm text-right"
                      aria-label="EC exchange rate"
                      title="EC dollars for 1 unit of the selected currency"
                      value={
                        row.exchangeRateToXcd ??
                        getDefaultExchangeRateToXcd(row.currency || "XCD")
                      }
                      onChange={(e) =>
                        handleRowChange(
                          incomeRows,
                          setIncomeRows,
                          idx,
                          "exchangeRateToXcd",
                          e.target.value
                        )
                      }
                      readOnly={["XCD", "USD"].includes(row.currency || "XCD")}
                    />
                    <div className="rounded border bg-white px-2 py-2 text-right text-xs text-slate-600">
                      EC {getIncomeRowAmountXcd(row).toFixed(2)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(incomeRows, setIncomeRows, idx)}
                      className="inline-flex items-center justify-center rounded border border-red-100 px-2 text-xs text-red-500 hover:text-red-700"
                      aria-label="Remove income row"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addRow(incomeRows, setIncomeRows)}
                  className="mt-2 text-xs text-blue-700 hover:underline"
                >
                  + Add line
                </button>
              </div>
            </Card>
          </div>

          <InputGroup label="Notes / Highlights">
            <textarea
              className="w-full border rounded px-3 py-2 text-sm min-h-[120px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key testimonies, outreach results, observations..."
            />
          </InputGroup>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Report"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

