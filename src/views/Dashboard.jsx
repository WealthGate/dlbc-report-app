import React, { useMemo, useState } from "react";
import { DollarSign, Edit, FilePlus, FileText, Home, Plus, Trash2 } from "lucide-react";
import {
  buildMonthlyServiceSummary,
  getAttendanceTotals,
  getIncomeTotal,
  isSpecialProgrammeRecord
} from "../reporting/serviceRecords";
import {
  Button,
  Card,
  formatLocalDateKey,
  formatLocalMonthKey,
  getServiceLabel,
  InputGroup,
  parseReportDate
} from "./viewShared";

export default function Dashboard({
  reports = [],
  onView,
  onEdit,
  onCreate,
  onDelete,
  isAdmin = false,
  canAccessMonthlyFinancialEntry = false,
  onOpenMonthlyFinancialEntry
}) {
  const [branchFilter, setBranchFilter] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [specialOnlyFilter, setSpecialOnlyFilter] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [singleDateFilter, setSingleDateFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(formatLocalMonthKey(new Date()));
  const [rangeStartDate, setRangeStartDate] = useState("");
  const [rangeEndDate, setRangeEndDate] = useState("");

  const formatDate = (value) => {
    if (!value) return "";
    try {
      const d = parseReportDate(value);
      if (d && !Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
      return value;
    } catch {
      return value;
    }
  };

  const getBranchName = (r) => {
    if (!r) return "";
    if (r.branch === "Other" && r.otherBranch) return r.otherBranch;
    return r.branch || "";
  };

  const getTotalAttendance = (r) => {
    return getAttendanceTotals(r).total;
  };

  const sortedReports = [...reports].sort((a, b) => {
    const ad = parseReportDate(a.date);
    const bd = parseReportDate(b.date);
    return (bd?.getTime() || 0) - (ad?.getTime() || 0);
  });

  const reportsByDateFilter = useMemo(() => {
    const normalizeDate = (value) => {
      const parsed = parseReportDate(value);
      if (!parsed || Number.isNaN(parsed.getTime())) return "";
      return formatLocalDateKey(parsed);
    };

    if (dateFilterMode === "date") {
      if (!singleDateFilter) return sortedReports;
      return sortedReports.filter((r) => normalizeDate(r.date) === singleDateFilter);
    }

    if (dateFilterMode === "month") {
      if (!monthFilter) return sortedReports;
      return sortedReports.filter((r) => {
        const normalized = normalizeDate(r.date);
        return normalized.startsWith(`${monthFilter}-`);
      });
    }

    if (dateFilterMode === "range") {
      const hasStart = Boolean(rangeStartDate);
      const hasEnd = Boolean(rangeEndDate);
      if (!hasStart && !hasEnd) return sortedReports;

      return sortedReports.filter((r) => {
        const normalized = normalizeDate(r.date);
        if (!normalized) return false;
        if (hasStart && normalized < rangeStartDate) return false;
        if (hasEnd && normalized > rangeEndDate) return false;
        return true;
      });
    }

    return sortedReports;
  }, [
    sortedReports,
    dateFilterMode,
    singleDateFilter,
    monthFilter,
    rangeStartDate,
    rangeEndDate
  ]);

  const filteredReports = useMemo(() => {
    return reportsByDateFilter.filter((report) => {
      if (serviceTypeFilter && getServiceLabel(report) !== serviceTypeFilter) return false;
      if (specialOnlyFilter && !isSpecialProgrammeRecord(report)) return false;
      return true;
    });
  }, [reportsByDateFilter, serviceTypeFilter, specialOnlyFilter]);

  const dashboardSummary = useMemo(
    () => buildMonthlyServiceSummary(filteredReports),
    [filteredReports]
  );

  const availableServiceTypes = useMemo(() => {
    const types = new Set();
    reportsByDateFilter.forEach((report) => types.add(getServiceLabel(report)));
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [reportsByDateFilter]);

  const reportsByBranch = useMemo(() => {
    const grouped = {};
    filteredReports.forEach((r) => {
      const branchName = getBranchName(r) || "Unspecified";
      if (!grouped[branchName]) grouped[branchName] = [];
      grouped[branchName].push(r);
    });
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => {
        const ad = parseReportDate(a.date);
        const bd = parseReportDate(b.date);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
    });
    return grouped;
  }, [filteredReports]);

  const branchOrder = useMemo(() => {
    const rank = (name) => {
      if (!name || name === "Unspecified") return 3;
      if (name === "Other") return 2;
      return 1;
    };
    return Object.keys(reportsByBranch).sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [reportsByBranch]);

  const shouldGroupByBranch = isAdmin && branchOrder.length > 0;

  const filteredBranchOrder = useMemo(() => {
    const query = branchFilter.trim().toLowerCase();
    if (!query) return branchOrder;
    return branchOrder.filter((name) => name.toLowerCase().includes(query));
  }, [branchFilter, branchOrder]);

  const renderRows = (list) =>
    list.map((r) => (
      <tr
        key={r.id}
        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
      >
        <td className="px-3 py-2 whitespace-nowrap">
          {formatDate(r.date)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{getBranchName(r)}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {getServiceLabel(r)}
        </td>
        <td className="px-3 py-2 text-right font-semibold">
          {getTotalAttendance(r)}
        </td>
        <td className="px-3 py-2 text-right">
          {getAttendanceTotals(r).newVisitors}
        </td>
        <td className="px-3 py-2 text-right">
          {getIncomeTotal(r).toFixed(2)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-slate-600">
          {r.createdBy || "-"}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onView && onView(r)}
              className="inline-flex items-center justify-center rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              <FileText size={14} className="mr-1" />
              View
            </button>
            <button
              type="button"
              onClick={() => onEdit && onEdit(r)}
              className="inline-flex items-center justify-center rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
            >
              <Edit size={14} className="mr-1" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete && onDelete(r.id)}
              className="inline-flex items-center justify-center rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} className="mr-1" />
              Delete
            </button>
          </div>
        </td>
      </tr>
    ));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Home className="text-blue-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
            <p className="text-sm text-slate-500">Overview of submitted branch reports</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAccessMonthlyFinancialEntry && (
            <Button
              variant="secondary"
              onClick={() => onOpenMonthlyFinancialEntry && onOpenMonthlyFinancialEntry()}
              className="flex items-center gap-2"
            >
              <DollarSign size={16} />
              Monthly Financial Entry
            </Button>
          )}
          <Button onClick={onCreate} className="flex items-center gap-2">
            <Plus size={16} />
            New Report
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <InputGroup label="Find by">
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value)}
            >
              <option value="all">All dates</option>
              <option value="date">Single date</option>
              <option value="range">Date range</option>
              <option value="month">Month</option>
            </select>
          </InputGroup>
          {dateFilterMode === "date" && (
            <InputGroup label="Service date">
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={singleDateFilter}
                onChange={(e) => setSingleDateFilter(e.target.value)}
              />
            </InputGroup>
          )}
          {dateFilterMode === "range" && (
            <>
              <InputGroup label="From date">
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={rangeStartDate}
                  onChange={(e) => setRangeStartDate(e.target.value)}
                />
              </InputGroup>
              <InputGroup label="To date">
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={rangeEndDate}
                  onChange={(e) => setRangeEndDate(e.target.value)}
                />
              </InputGroup>
            </>
          )}
          {dateFilterMode === "month" && (
            <InputGroup label="Month">
              <input
                type="month"
                className="w-full border rounded px-3 py-2 text-sm"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </InputGroup>
          )}
          <InputGroup label="Service type">
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={serviceTypeFilter}
              onChange={(e) => setServiceTypeFilter(e.target.value)}
            >
              <option value="">All service types</option>
              {availableServiceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </InputGroup>
          <label className="inline-flex min-h-[42px] items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={specialOnlyFilter}
              onChange={(e) => setSpecialOnlyFilter(e.target.checked)}
            />
            Special programmes only
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Showing {filteredReports.length} of {sortedReports.length} report(s).
        </p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Services</p>
          <p className="text-2xl font-bold text-slate-900">{dashboardSummary.totals.serviceCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Attendance</p>
          <p className="text-2xl font-bold text-slate-900">{dashboardSummary.totals.attendance}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">New Visitors</p>
          <p className="text-2xl font-bold text-slate-900">{dashboardSummary.totals.newVisitors}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Income</p>
          <p className="text-2xl font-bold text-slate-900">
            {dashboardSummary.totals.income.toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Special Programmes</p>
          <p className="text-2xl font-bold text-slate-900">
            {dashboardSummary.specialProgrammes.length}
          </p>
        </Card>
      </div>

      {filteredReports.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-slate-600 mb-4">No reports found for the selected date filter.</p>
          <Button onClick={onCreate} className="inline-flex items-center gap-2">
            <FilePlus size={16} />
            Create report
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[32rem] overflow-auto">
            {shouldGroupByBranch ? (
              <div className="space-y-6 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-slate-600" htmlFor="branch-filter">
                    Filter branches
                  </label>
                  <input
                    id="branch-filter"
                    type="text"
                    placeholder="Search by branch name"
                    className="w-full max-w-xs rounded border border-slate-200 px-3 py-2 text-sm"
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                  />
                  <span className="text-xs text-slate-500">
                    Showing {filteredBranchOrder.length} of {branchOrder.length}
                  </span>
                </div>
                {filteredBranchOrder.length === 0 ? (
                  <p className="text-sm text-slate-500">No branches match your filter.</p>
                ) : (
                  filteredBranchOrder.map((branchName) => (
                  <div key={branchName}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">
                        {branchName} ({reportsByBranch[branchName].length})
                      </h3>
                    </div>
                    <table className="w-full text-sm border border-slate-200 rounded">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-slate-700">Date</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-700">Branch</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-700">Service</th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-700">
                            Attendance
                          </th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-700">
                            Visitors
                          </th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-700">
                            Income
                          </th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-700">Prepared By</th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>{renderRows(reportsByBranch[branchName])}</tbody>
                    </table>
                  </div>
                  ))
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Date</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Branch</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Service</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700">
                      Attendance
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700">
                      Visitors
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700">
                      Income
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Prepared By</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>{renderRows(filteredReports)}</tbody>
              </table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

