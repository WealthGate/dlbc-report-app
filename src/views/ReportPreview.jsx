import React from "react";
import { DollarSign, Download, Edit, FileText, Printer, Save, Users } from "lucide-react";
import {
  buildServiceReportEmailBody,
  Button,
  Card,
  formatExpenseDisplay,
  formatLocalDateKey,
  getServiceLabel,
  normalizeKeyPart,
  openMailTo
} from "./viewShared";

export default function ReportPreview({ report, onBack, onEdit }) {
  if (!report) return null;

  const branchName =
    report.branch === "Other" && report.otherBranch ? report.otherBranch : report.branch;

  const totalAttendance = (() => {
    const a = report.attendance || {};
    const m = parseInt(a.men || 0, 10);
    const w = parseInt(a.women || 0, 10);
    const c = parseInt(a.children || 0, 10);
    return (m || 0) + (w || 0) + (c || 0);
  })();

  const income = report.financials?.income || [];
  const expenses = report.financials?.expenses || [];
  const incomeTotal = income.reduce((s, r) => s + (parseFloat(r.amount || 0) || 0), 0);
  const expenseTotal = expenses.reduce((s, r) => s + (parseFloat(r.amount || 0) || 0), 0);
  const branchLabel = report.branch === "Other" && report.otherBranch ? report.otherBranch : report.branch;

  const handleEmailReport = () => {
    const subject = `Service Report - ${branchLabel || "Branch"} - ${report.date || ""}`.trim();
    const body = buildServiceReportEmailBody(report);
    openMailTo(subject, body);
  };

  const handleDownloadReport = () => {
    const text = buildServiceReportEmailBody(report);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeBranch = normalizeKeyPart(branchLabel || "branch");
    const safeDate = normalizeKeyPart(report.date || formatLocalDateKey(new Date()));
    const link = document.createElement("a");
    link.href = url;
    link.download = `service-report-${safeBranch}-${safeDate}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText className="text-blue-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Report Preview</h2>
            <p className="text-sm text-slate-500">
              Review the details before printing or making changes.
            </p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={onBack}>
            Back to list
          </Button>
          <Button variant="secondary" onClick={handleDownloadReport}>
            <Save size={16} className="mr-1" />
            Save report file
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} className="mr-1" />
            Print report
          </Button>
          <Button variant="secondary" onClick={handleEmailReport}>
            <Download size={16} className="mr-1" />
            Email report
          </Button>
          <Button onClick={() => onEdit && onEdit(report)}>
            <Edit size={16} className="mr-1" />
            Edit report
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-6 print:shadow-none print:border-none">
      <div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Service Information</h3>
            <p>
              <span className="font-semibold">Date:</span> {report.date}
            </p>
            <p>
              <span className="font-semibold">Service:</span> {getServiceLabel(report)}
            </p>
            <p>
              <span className="font-semibold">Branch:</span> {branchName}
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Prepared By</h3>
            <p>
              <span className="font-semibold">Email:</span> {report.createdBy || "-"}
            </p>
            <p>
              <span className="font-semibold">Created:</span>{" "}
              {report.createdAt ? new Date(report.createdAt).toLocaleString() : "-"}
            </p>
            {report.lastModifiedAt && (
              <p>
                <span className="font-semibold">Last Updated:</span>{" "}
                {new Date(report.lastModifiedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        </div>

        <Card className="p-4 bg-slate-50 border-slate-200">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users size={18} className="text-blue-700" />
            Attendance
          </h3>
          <div className="grid md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="font-semibold">Men:</span> {report.attendance?.men || 0}
            </div>
            <div>
              <span className="font-semibold">Women:</span> {report.attendance?.women || 0}
            </div>
            <div>
              <span className="font-semibold">Children:</span> {report.attendance?.children || 0}
            </div>
            <div>
              <span className="font-semibold">Total:</span> {totalAttendance}
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <Card className="p-4 bg-slate-50 border-slate-200">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <DollarSign size={18} className="text-green-700" />
              Income (XCD)
            </h3>
            {income.length === 0 ? (
              <p className="text-slate-500 text-sm">No income lines recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {income.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{row.label}</td>
                      <td className="py-1 text-right">
                        {parseFloat(row.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 text-right">{incomeTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-4 bg-slate-50 border-slate-200">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <DollarSign size={18} className="text-red-700" />
              Expenses (XCD)
            </h3>
            {expenses.length === 0 ? (
              <p className="text-slate-500 text-sm">No expenses lines recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {expenses.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{formatExpenseDisplay(row, branchName)}</td>
                      <td className="py-1 text-right">
                        {parseFloat(row.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 text-right">{expenseTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {report.notes && (
          <Card className="p-4 bg-slate-50 border-slate-200">
            <h3 className="font-semibold mb-2">Notes / Highlights</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{report.notes}</p>
          </Card>
        )}
      </Card>
    </div>
  );
}

