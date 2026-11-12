const AUTH_TOKEN_KEY = "documentdb_perf_auth_token";

const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatusEl = document.getElementById("authStatus");
const superadminPanelEl = document.getElementById("superadminPanel");
const securedContentEl = document.getElementById("securedContent");
const requiresAuthEls = document.querySelectorAll(".requires-auth");

const uploadForm = document.getElementById("uploadForm");
const runForm = document.getElementById("runForm");
const runPerfBtn = document.getElementById("runPerfBtn");
const uploadResultEl = document.getElementById("uploadResult");
const runStatusEl = document.getElementById("runStatus");
const requestSummaryEl = document.getElementById("requestSummary");
const progressBarEl = document.getElementById("progressBar");
const progressLabelEl = document.getElementById("progressLabel");
const exportActionsEl = document.getElementById("exportActions");
const downloadCsvEl = document.getElementById("downloadCsv");
const downloadPdfEl = document.getElementById("downloadPdf");
const cancelJobBtn = document.getElementById("cancelJobBtn");
const cancelQueryBtn = document.getElementById("cancelQueryBtn");
const ingestLatencyChartEl = document.getElementById("ingestLatencyChart");
const ingestThroughputChartEl = document.getElementById("ingestThroughputChart");
const queryLatencyChartEl = document.getElementById("queryLatencyChart");
const queryThroughputChartEl = document.getElementById("queryThroughputChart");
const cpuUtilChartEl = document.getElementById("cpuUtilChart");
const memoryUtilChartEl = document.getElementById("memoryUtilChart");
const iopsChartEl = document.getElementById("iopsChart");
const summaryTableWrapEl = document.getElementById("summaryTableWrap");
const percentileTableWrapEl = document.getElementById("percentileTableWrap");
const windowTableWrapEl = document.getElementById("windowTableWrap");
const resourceMetricsWrapEl = document.getElementById("resourceMetricsWrap");

const queryTypeEl = document.getElementById("queryType");
const queryField1El = document.getElementById("queryField1");
const queryField2El = document.getElementById("queryField2");
const queryCustomFilterEl = document.getElementById("queryCustomFilter");
const queryCustomProjectionEl = document.getElementById("queryCustomProjection");
const queryCustomSortEl = document.getElementById("queryCustomSort");
const queryCustomLimitEl = document.getElementById("queryCustomLimit");
const useRedisCacheEl = document.getElementById("useRedisCache");
const redisSkuSelectEl = document.getElementById("redisSkuSelect");
const queryConfigStatusEl = document.getElementById("queryConfigStatus");
const provisionRedisBtn = document.getElementById("provisionRedisBtn");
const runQueryBtn = document.getElementById("runQueryBtn");

const mySummaryWrapEl = document.getElementById("mySummaryWrap");
const myTestsWrapEl = document.getElementById("myTestsWrap");
const refreshMyReportsBtn = document.getElementById("refreshMyReportsBtn");
const mySearchEl = document.getElementById("mySearch");
const myStatusFilterEl = document.getElementById("myStatusFilter");
const myPageSizeEl = document.getElementById("myPageSize");
const myPrevPageEl = document.getElementById("myPrevPage");
const myNextPageEl = document.getElementById("myNextPage");
const myPageInfoEl = document.getElementById("myPageInfo");

const createUserForm = document.getElementById("createUserForm");
const createUserStatusEl = document.getElementById("createUserStatus");
const adminUsersWrapEl = document.getElementById("adminUsersWrap");
const adminAggregateWrapEl = document.getElementById("adminAggregateWrap");
const adminTestsWrapEl = document.getElementById("adminTestsWrap");
const refreshAdminBtn = document.getElementById("refreshAdminBtn");
const adminSearchEl = document.getElementById("adminSearch");
const adminOwnerFilterEl = document.getElementById("adminOwnerFilter");
const adminStatusFilterEl = document.getElementById("adminStatusFilter");
const adminPageSizeEl = document.getElementById("adminPageSize");
const adminPrevPageEl = document.getElementById("adminPrevPage");
const adminNextPageEl = document.getElementById("adminNextPage");
const adminPageInfoEl = document.getElementById("adminPageInfo");

let activeJobId = null;
let pollTimer = null;
let currentUser = null;
const chartSnapshots = {
  ingestion: { latencyValues: [], throughputValues: [] },
  query: { latencyValues: [], throughputValues: [] }
};

const myPagination = { page: 1, pageSize: 20, totalPages: 1 };
const adminPagination = { page: 1, pageSize: 20, totalPages: 1 };

function isElevatedRole(role) {
  return ["superadmin", "admin"].includes(role);
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function setAuthStatus(message, authenticated) {
  authStatusEl.textContent = message;
  authStatusEl.classList.toggle("auth-ok", Boolean(authenticated));
  authStatusEl.classList.toggle("auth-bad", !authenticated);
}

async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    setAuthToken("");
    currentUser = null;
    toggleSuperadmin(false);
    toggleAuthenticatedUI(false);
    setAuthStatus("Unauthorized. Please login again.", false);
    throw new Error("Unauthorized. Please login.");
  }

  return response;
}

function toggleSuperadmin(enabled) {
  superadminPanelEl.classList.toggle("hidden", !enabled);
}

function toggleAuthenticatedUI(authenticated) {
  securedContentEl.classList.toggle("hidden", !authenticated);
  loginBtn.classList.toggle("hidden", authenticated);
  logoutBtn.classList.toggle("hidden", !authenticated);
  requiresAuthEls.forEach((el) => el.classList.toggle("hidden", !authenticated));
}

function setProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  progressBarEl.style.width = `${safePercent}%`;
  progressLabelEl.textContent = `${safePercent.toFixed(2)}%`;
}

function setRunSubmissionBusy(isBusy) {
  if (runPerfBtn) {
    runPerfBtn.disabled = Boolean(isBusy);
  }
  if (runQueryBtn) {
    runQueryBtn.disabled = Boolean(isBusy);
  }
}

function setCancelButtonsVisible(visible) {
  cancelJobBtn.classList.toggle("hidden", !visible);
  if (cancelQueryBtn) {
    cancelQueryBtn.classList.toggle("hidden", !visible);
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSchemaPreview(schema) {
  const fields = schema && schema.fields ? Object.entries(schema.fields) : [];
  if (!fields.length) {
    return "No schema fields inferred.";
  }

  const preview = fields
    .slice(0, 8)
    .map(([name, def]) => `${name}:${def && def.type ? def.type : "unknown"}`)
    .join(", ");
  const remaining = fields.length - Math.min(fields.length, 8);
  return remaining > 0 ? `${preview}, +${remaining} more` : preview;
}

function renderTable(targetEl, columns, rows) {
  if (!rows.length) {
    targetEl.innerHTML = '<div class="table-empty">No benchmark data yet for this Azure DocumentDB test run.</div>';
    return;
  }

  const headers = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => {
      const tds = columns
        .map((column) => {
          const value =
            typeof column.render === "function"
              ? column.render(row)
              : escapeHtml(row[column.key] ?? "");
          return `<td>${value}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  targetEl.innerHTML = `<div class="table-scroll"><table class="result-table"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function formatNumber(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  return numeric.toFixed(decimals);
}

function drawLineChart(canvas, values, color, yLabel, xLabel = "Time (seconds)") {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const plotLeft = 74;
  const plotRight = 12;
  const plotTop = 34;
  const plotBottom = 26;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = height - plotTop - plotBottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(0, 0, width, height);

  if (!values.length) {
    ctx.fillStyle = "#415a77";
    ctx.font = "12px Segoe UI";
    ctx.fillText("No Azure DocumentDB cluster samples yet", plotLeft, 22);
    ctx.fillStyle = "#4f6680";
    ctx.font = "11px Segoe UI";
    ctx.fillText(yLabel, plotLeft, 14);
    ctx.fillText(xLabel, Math.max(plotLeft, width / 2 - 40), height - 6);
    return;
  }

  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(1, maxValue - minValue);

  ctx.fillStyle = "#4f6680";
  ctx.font = "11px Segoe UI";
  ctx.fillText(yLabel, plotLeft, 14);
  const latest = values[values.length - 1];
  const peak = Math.max(...values);
  const statsText = `Latest: ${formatNumber(latest)} | Peak: ${formatNumber(peak)}`;
  const statsWidth = ctx.measureText(statsText).width;
  ctx.fillText(statsText, Math.max(plotLeft + 8, width - plotRight - statsWidth), 14);

  ctx.strokeStyle = "rgba(0, 120, 212, 0.14)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#607892";
  ctx.font = "10px Segoe UI";
  for (let i = 0; i <= 4; i += 1) {
    const y = plotTop + (i * plotHeight) / 4;
    const tickValue = maxValue - (i * range) / 4;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(width - plotRight, y);
    ctx.stroke();
    ctx.fillText(formatNumber(tickValue), 4, y + 3);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (values.length === 1) {
    const y = plotTop + (1 - (values[0] - minValue) / range) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotLeft + plotWidth, y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = plotLeft + (index / (values.length - 1)) * plotWidth;
      const y = plotTop + (1 - (value - minValue) / range) * plotHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  ctx.fillStyle = "#4f6680";
  ctx.font = "11px Segoe UI";
  ctx.fillText(xLabel, Math.max(plotLeft, width / 2 - 40), height - 6);
}

function renderOperationCharts() {
  drawLineChart(
    ingestLatencyChartEl,
    chartSnapshots.ingestion.latencyValues,
    "#005fb8",
    "Latency (ms)"
  );
  drawLineChart(
    ingestThroughputChartEl,
    chartSnapshots.ingestion.throughputValues,
    "#0078d4",
    "Throughput (req/s)"
  );
  drawLineChart(queryLatencyChartEl, chartSnapshots.query.latencyValues, "#3f4bd8", "Latency (ms)");
  drawLineChart(
    queryThroughputChartEl,
    chartSnapshots.query.throughputValues,
    "#10819d",
    "Throughput (req/s)"
  );
}

function buildPerSecondSeriesFromSamples(samples, metricKeys) {
  const filtered = samples
    .filter((item) => metricKeys.includes(item.metricName))
    .map((item) => ({
      ts: Date.parse(item.timeStamp || ""),
      value: Number(item.average ?? item.maximum ?? 0)
    }))
    .filter((item) => Number.isFinite(item.ts) && Number.isFinite(item.value))
    .sort((a, b) => a.ts - b.ts);

  if (!filtered.length) {
    return [];
  }

  const values = [];
  for (let i = 0; i < filtered.length; i += 1) {
    values.push(filtered[i].value);
    if (i === filtered.length - 1) {
      continue;
    }
    const gapSeconds = Math.max(0, Math.floor((filtered[i + 1].ts - filtered[i].ts) / 1000) - 1);
    for (let fill = 0; fill < gapSeconds; fill += 1) {
      values.push(filtered[i].value);
    }
  }

  return values;
}

function renderResourceCharts(resourceMetrics) {
  const cpuSeries = buildPerSecondSeriesFromSamples(resourceMetrics, ["cpu_percent", "CpuPercent"]);
  const memorySeries = buildPerSecondSeriesFromSamples(resourceMetrics, ["memory_percent", "MemoryPercent"]);
  const iopsSeries = buildPerSecondSeriesFromSamples(resourceMetrics, ["physical_iops_consumed", "IOPS"]);

  drawLineChart(cpuUtilChartEl, cpuSeries, "#1f5ca9", "CPU (%)", "Time (seconds, derived)");
  drawLineChart(
    memoryUtilChartEl,
    memorySeries,
    "#177f5f",
    "Memory (%)",
    "Time (seconds, derived)"
  );
  drawLineChart(iopsChartEl, iopsSeries, "#a04f00", "IOPS", "Time (seconds, derived)");
}

function summarizeResourceMetrics(samples) {
  const byMetric = new Map();
  samples.forEach((item) => {
    const key = item.metricName;
    if (!byMetric.has(key)) {
      byMetric.set(key, []);
    }
    byMetric.get(key).push(item);
  });

  const wanted = [
    { keys: ["cpu_percent", "CpuPercent"], label: "CPU Utilization (%)" },
    { keys: ["memory_percent", "MemoryPercent"], label: "Memory Utilization (%)" },
    { keys: ["physical_iops_consumed", "IOPS"], label: "IOPS Consumed" }
  ];

  return wanted
    .map((metric) => {
      const rows = metric.keys
        .flatMap((key) => byMetric.get(key) || [])
        .sort((a, b) => Date.parse(a.timeStamp || 0) - Date.parse(b.timeStamp || 0));
      if (!rows.length) {
        return null;
      }
      const latest = rows[rows.length - 1];
      return {
        metric: metric.label,
        timeStamp: latest.timeStamp,
        latestAverage: latest.average ?? "n/a",
        latestMaximum: latest.maximum ?? "n/a"
      };
    })
    .filter(Boolean);
}

function renderJobTables(job) {
  const result = job.result || {};
  const perSecondStats = (job.telemetry && job.telemetry.perSecondStats) || [];
  const resourceMetrics =
    (job.telemetry && job.telemetry.resourceMetrics && job.telemetry.resourceMetrics.samples) || [];
  const operationType = (job.request && job.request.operationType) || "write";

  const latencyValues = perSecondStats.map((item) => Number(item.averageLatencyMs || 0));
  const throughputValues = perSecondStats.map((item) => Number(item.throughputRps || 0));
  if (operationType === "query") {
    chartSnapshots.query = { latencyValues, throughputValues };
  } else {
    chartSnapshots.ingestion = { latencyValues, throughputValues };
  }

  renderTable(
    summaryTableWrapEl,
    [
      { key: "testName", label: "Test Name" },
      { key: "jobId", label: "Job ID" },
      { key: "status", label: "Status" },
      { key: "operation", label: "Operation" },
      { key: "queryType", label: "Query Type" },
      { key: "cacheEnabled", label: "Redis Cache" },
      { key: "cacheHits", label: "Cache Hits" },
      { key: "cacheMisses", label: "Cache Misses" },
      { key: "avgLatencyMs", label: "Avg Latency (ms)" },
      { key: "throughputRps", label: "Throughput (req/s)" }
    ],
    [
      {
        testName: job.testName || "",
        jobId: job.id,
        status: job.status,
        operation: job.request ? job.request.operationType : "",
        queryType: job.request && job.request.querySpec ? job.request.querySpec.queryType : "",
        cacheEnabled: job.request && job.request.useRedisCache ? "Yes" : "No",
        cacheHits: result.cacheHits ?? 0,
        cacheMisses: result.cacheMisses ?? 0,
        avgLatencyMs: result.averageLatencyMs ?? 0,
        throughputRps: result.throughputRps ?? 0
      }
    ]
  );

  renderTable(
    percentileTableWrapEl,
    [
      { key: "percentile", label: "Percentile" },
      { key: "latencyMs", label: "Latency (ms)" },
      { key: "successCount", label: "Success" },
      { key: "failureCount", label: "Failure" },
      { key: "requestCount", label: "Requests" }
    ],
    (result.percentileBreakdown || []).map((item) => ({
      percentile: `P${item.percentile}`,
      latencyMs: item.latencyMs,
      successCount: item.successCount,
      failureCount: item.failureCount,
      requestCount: item.requestCount
    }))
  );

  renderTable(
    windowTableWrapEl,
    [
      { key: "second", label: "Second" },
      { key: "percentile", label: "Percentile" },
      { key: "latencyMs", label: "Latency (ms)" },
      { key: "successCount", label: "Success" },
      { key: "failureCount", label: "Failure" },
      { key: "requestCount", label: "Requests" }
    ],
    perSecondStats.slice(-10).flatMap((secondItem) =>
      (secondItem.percentileBreakdown || []).map((windowItem) => ({
        second: secondItem.second,
        percentile: `P${windowItem.percentile}`,
        latencyMs: windowItem.latencyMs,
        successCount: windowItem.successCount,
        failureCount: windowItem.failureCount,
        requestCount: windowItem.requestCount
      }))
    )
  );

  if (resourceMetrics.length) {
    const summaryRows = summarizeResourceMetrics(resourceMetrics);
    if (!summaryRows.length) {
      resourceMetricsWrapEl.innerHTML = '<div class="table-empty">No Azure DocumentDB cluster CPU, memory, or IOPS samples were returned for this run window.</div>';
    } else {
      renderTable(
        resourceMetricsWrapEl,
        [
          { key: "metric", label: "Metric" },
          { key: "timeStamp", label: "Time" },
          { key: "latestAverage", label: "Latest Avg" },
          { key: "latestMaximum", label: "Latest Max" }
        ],
        summaryRows
      );
    }
  } else {
    const reason = job.telemetry && job.telemetry.resourceMetrics && job.telemetry.resourceMetrics.reason;
    resourceMetricsWrapEl.innerHTML = `<div class="table-empty">${escapeHtml(
      reason || "No Azure DocumentDB cluster resource metrics were captured."
    )}</div>`;
  }

  renderResourceCharts(resourceMetrics);

  runStatusEl.textContent = `Status: ${job.status}. Completed requests: ${job.progress ? job.progress.completedRequests : 0}`;
  renderOperationCharts();
}

function updatePagerDisplay(pagerInfoEl, prevEl, nextEl, page, totalPages) {
  pagerInfoEl.textContent = `Page ${page} of ${totalPages}`;
  prevEl.disabled = page <= 1;
  nextEl.disabled = page >= totalPages;
}

function updateRequestSummary() {
  const tps = Number(document.getElementById("tps").value || 0);
  const durationSeconds = Number(document.getElementById("durationSeconds").value || 0);
  const operationType = document.getElementById("operationType").value;
  const totalRequests = tps > 0 && durationSeconds > 0 ? tps * durationSeconds : 0;
  requestSummaryEl.textContent = `Planned ${operationType} requests: ${totalRequests.toLocaleString()}`;
}

function buildQuerySpec() {
  return {
    queryType: queryTypeEl.value,
    field1: queryField1El.value.trim(),
    field2: queryField2El.value.trim(),
    customFilter: queryCustomFilterEl.value.trim() || "{}",
    customProjection: queryCustomProjectionEl.value.trim() || "{}",
    customSort: queryCustomSortEl.value.trim() || "{}",
    customLimit: Number(queryCustomLimitEl.value || 50)
  };
}

async function loadJobDetails(jobId, endpointBase = "/api/reports/my-tests") {
  const response = await apiFetch(`${endpointBase}/${jobId}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Unable to load test details.");
  }

  activeJobId = payload.id;
  renderJobTables(payload);
}

async function pollJob(jobId) {
  const response = await apiFetch(`/api/perf/jobs/${jobId}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Unable to fetch job status.");
  }

  setProgress(payload.progress.percent || 0);
  renderJobTables(payload);

  if (["completed", "cancelled"].includes(payload.status)) {
    stopPolling();
    setRunSubmissionBusy(false);
    exportActionsEl.classList.remove("hidden");
    setCancelButtonsVisible(false);
    await refreshMyReports();
    if (currentUser && isElevatedRole(currentUser.role)) {
      await refreshAdminData();
    }
    return;
  }

  if (payload.status === "failed") {
    stopPolling();
    setRunSubmissionBusy(false);
    setCancelButtonsVisible(false);
    throw new Error(payload.error || "Performance test failed.");
  }
}

async function refreshMyReports() {
  if (!currentUser) {
    return;
  }

  myPagination.pageSize = Number(myPageSizeEl.value || 20);
  const query = new URLSearchParams({
    page: String(myPagination.page),
    pageSize: String(myPagination.pageSize),
    status: myStatusFilterEl.value,
    search: mySearchEl.value.trim()
  });

  const [summaryResponse, testsResponse] = await Promise.all([
    apiFetch("/api/reports/my-summary"),
    apiFetch(`/api/reports/my-tests?${query.toString()}`)
  ]);

  const summary = await summaryResponse.json();
  const testsPage = await testsResponse.json();

  myPagination.totalPages = testsPage.totalPages || 1;
  myPagination.page = testsPage.page || 1;
  updatePagerDisplay(myPageInfoEl, myPrevPageEl, myNextPageEl, myPagination.page, myPagination.totalPages);

  renderTable(
    mySummaryWrapEl,
    [
      { key: "totalTests", label: "Total Tests" },
      { key: "completedTests", label: "Completed" },
      { key: "cancelledTests", label: "Cancelled" },
      { key: "runningTests", label: "Running" },
      { key: "totalSuccessRequests", label: "Success Requests" },
      { key: "totalFailureRequests", label: "Failure Requests" }
    ],
    [summary]
  );

  renderTable(
    myTestsWrapEl,
    [
      { key: "testName", label: "Test Name" },
      { key: "status", label: "Status" },
      { key: "operationType", label: "Operation" },
      { key: "tps", label: "TPS" },
      { key: "instanceSize", label: "Tier" },
      { key: "createdAt", label: "Created" },
      { key: "throughputRps", label: "Throughput" },
      {
        key: "action",
        label: "Action",
        render: (row) => `<button type="button" class="ghost tiny-btn" data-action="view-my-test" data-id="${escapeHtml(row.id)}">View</button>`
      }
    ],
    testsPage.items || []
  );
}

async function refreshAdminData() {
  if (!currentUser || !isElevatedRole(currentUser.role)) {
    return;
  }

  adminPagination.pageSize = Number(adminPageSizeEl.value || 20);
  const query = new URLSearchParams({
    page: String(adminPagination.page),
    pageSize: String(adminPagination.pageSize),
    status: adminStatusFilterEl.value,
    owner: adminOwnerFilterEl.value.trim(),
    search: adminSearchEl.value.trim()
  });

  const [usersResp, aggregateResp, testsResp] = await Promise.all([
    apiFetch("/api/admin/users"),
    apiFetch("/api/admin/reports/aggregate"),
    apiFetch(`/api/admin/tests?${query.toString()}`)
  ]);

  const users = await usersResp.json();
  const aggregate = await aggregateResp.json();
  const testsPage = await testsResp.json();

  adminPagination.totalPages = testsPage.totalPages || 1;
  adminPagination.page = testsPage.page || 1;
  updatePagerDisplay(adminPageInfoEl, adminPrevPageEl, adminNextPageEl, adminPagination.page, adminPagination.totalPages);

  renderTable(
    adminUsersWrapEl,
    [
      { key: "username", label: "Username" },
      { key: "role", label: "Role" },
      { key: "createdAt", label: "Created" },
      { key: "updatedAt", label: "Updated" }
    ],
    users
  );

  renderTable(
    adminAggregateWrapEl,
    [
      { key: "ownerUsername", label: "User" },
      { key: "totalTests", label: "Total Tests" },
      { key: "completedTests", label: "Completed" },
      { key: "cancelledTests", label: "Cancelled" },
      { key: "totalSuccessRequests", label: "Success Requests" },
      { key: "totalFailureRequests", label: "Failure Requests" }
    ],
    aggregate
  );

  renderTable(
    adminTestsWrapEl,
    [
      { key: "ownerUsername", label: "User" },
      { key: "testName", label: "Test Name" },
      { key: "status", label: "Status" },
      { key: "operationType", label: "Operation" },
      { key: "tps", label: "TPS" },
      { key: "instanceSize", label: "Tier" },
      { key: "createdAt", label: "Created" },
      {
        key: "action",
        label: "Action",
        render: (row) => `<button type="button" class="ghost tiny-btn" data-action="view-admin-test" data-id="${escapeHtml(row.id)}">View</button>`
      }
    ],
    testsPage.items || []
  );
}

async function loadRedisSkuOptions() {
  try {
    const response = await apiFetch("/api/perf/redis/sku-options");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Unable to load Redis SKU options.");
    }

    redisSkuSelectEl.innerHTML = (payload.options || [])
      .map((item) => {
        const recommended = item.recommended || item.value === payload.recommendedForDocumentDbM40;
        return `<option value="${escapeHtml(item.value)}" ${recommended ? "selected" : ""}>${escapeHtml(item.label)}</option>`;
      })
      .join("");
  } catch (error) {
    queryConfigStatusEl.textContent = error.message;
  }
}

async function checkSession() {
  const token = getAuthToken();
  if (!token) {
    toggleAuthenticatedUI(false);
    setAuthStatus("Not logged in", false);
    toggleSuperadmin(false);
    return;
  }

  try {
    const response = await apiFetch("/api/auth/me");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Session check failed.");
    }

    currentUser = payload;
  toggleAuthenticatedUI(true);
    setAuthStatus(`Logged in as ${payload.username} (${payload.role})`, true);
    toggleSuperadmin(isElevatedRole(payload.role));
    await refreshMyReports();
    await refreshAdminData();
    await loadRedisSkuOptions();
  } catch (_error) {
    currentUser = null;
    toggleAuthenticatedUI(false);
    toggleSuperadmin(false);
    setAuthStatus("Session expired. Please login.", false);
  }
}

function bindToolbarActions() {
  refreshMyReportsBtn.addEventListener("click", () => refreshMyReports().catch((error) => {
    runStatusEl.textContent = error.message;
  }));

  refreshAdminBtn.addEventListener("click", () => refreshAdminData().catch((error) => {
    createUserStatusEl.textContent = error.message;
  }));

  myPrevPageEl.addEventListener("click", () => {
    if (myPagination.page > 1) {
      myPagination.page -= 1;
      refreshMyReports().catch((error) => {
        runStatusEl.textContent = error.message;
      });
    }
  });

  myNextPageEl.addEventListener("click", () => {
    if (myPagination.page < myPagination.totalPages) {
      myPagination.page += 1;
      refreshMyReports().catch((error) => {
        runStatusEl.textContent = error.message;
      });
    }
  });

  adminPrevPageEl.addEventListener("click", () => {
    if (adminPagination.page > 1) {
      adminPagination.page -= 1;
      refreshAdminData().catch((error) => {
        createUserStatusEl.textContent = error.message;
      });
    }
  });

  adminNextPageEl.addEventListener("click", () => {
    if (adminPagination.page < adminPagination.totalPages) {
      adminPagination.page += 1;
      refreshAdminData().catch((error) => {
        createUserStatusEl.textContent = error.message;
      });
    }
  });

  [mySearchEl, myStatusFilterEl, myPageSizeEl].forEach((el) => {
    el.addEventListener("input", () => {
      myPagination.page = 1;
      refreshMyReports().catch((error) => {
        runStatusEl.textContent = error.message;
      });
    });
    el.addEventListener("change", () => {
      myPagination.page = 1;
      refreshMyReports().catch((error) => {
        runStatusEl.textContent = error.message;
      });
    });
  });

  [adminSearchEl, adminOwnerFilterEl, adminStatusFilterEl, adminPageSizeEl].forEach((el) => {
    el.addEventListener("input", () => {
      adminPagination.page = 1;
      refreshAdminData().catch((error) => {
        createUserStatusEl.textContent = error.message;
      });
    });
    el.addEventListener("change", () => {
      adminPagination.page = 1;
      refreshAdminData().catch((error) => {
        createUserStatusEl.textContent = error.message;
      });
    });
  });
}

document.getElementById("tps").addEventListener("input", updateRequestSummary);
document.getElementById("durationSeconds").addEventListener("input", updateRequestSummary);
document.getElementById("operationType").addEventListener("change", updateRequestSummary);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("authUsername").value.trim();
  const password = document.getElementById("authPassword").value;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Login failed.");
    }

    setAuthToken(payload.token);
    currentUser = { username: payload.username, role: payload.role || "user" };
    toggleAuthenticatedUI(true);
    setAuthStatus(`Logged in as ${payload.username} (${currentUser.role})`, true);
    toggleSuperadmin(isElevatedRole(currentUser.role));
    myPagination.page = 1;
    adminPagination.page = 1;
    await refreshMyReports();
    await refreshAdminData();
    await loadRedisSkuOptions();
  } catch (error) {
    setAuthStatus(error.message, false);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (_error) {
    // no-op
  }

  setAuthToken("");
  currentUser = null;
  toggleAuthenticatedUI(false);
  toggleSuperadmin(false);
  setAuthStatus("Logged out", false);
});

createUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("newUsername").value.trim();
  const password = document.getElementById("newPassword").value;
  const role = document.getElementById("newUserRole").value;

  try {
    const response = await apiFetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Failed to create user.");
    }

    createUserStatusEl.textContent = `Saved user ${payload.username} (${payload.role}).`;
    createUserForm.reset();
    await refreshAdminData();
  } catch (error) {
    createUserStatusEl.textContent = error.message;
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadResultEl.textContent = "Uploading...";

  const fileInput = document.getElementById("jsonFiles");
  const uploadIdInput = document.getElementById("uploadId");
  const files = fileInput.files;

  if (!files.length) {
    uploadResultEl.textContent = "Choose at least one JSON file.";
    return;
  }

  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));

  try {
    const response = await apiFetch("/api/uploads/json", {
      method: "POST",
      body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Upload failed.");
    }

    uploadIdInput.value = payload.uploadId;
    const summary = [
      `Upload successful.`,
      `Upload ID: ${payload.uploadId}`,
      `Files: ${payload.fileCount || 0}`,
      `Documents: ${payload.totalUploadedDocs || 0}`,
      `Schema fields: ${buildSchemaPreview(payload.schema)}`
    ];
    uploadResultEl.textContent = summary.join("\n");
  } catch (error) {
    uploadResultEl.textContent = error.message;
  }
});

runForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  stopPolling();
  setRunSubmissionBusy(true);
  exportActionsEl.classList.add("hidden");
  setCancelButtonsVisible(true);
  setProgress(0);
  runStatusEl.textContent = "Queueing performance test...";

  const operationType = document.getElementById("operationType").value;
  const body = {
    testName: document.getElementById("testName").value.trim(),
    uploadId: document.getElementById("uploadId").value.trim(),
    collectionName: document.getElementById("collectionName").value.trim(),
    operationType,
    tps: Number(document.getElementById("tps").value),
    durationSeconds: Number(document.getElementById("durationSeconds").value),
    instanceSize: document.getElementById("instanceSize").value,
    cleanupAfterTest: document.getElementById("cleanupAfterTest").checked,
    useRedisCache: useRedisCacheEl.checked,
    redisSku: redisSkuSelectEl.value,
    querySpec: buildQuerySpec()
  };

  if (operationType !== "query") {
    body.querySpec = null;
    body.useRedisCache = false;
  }

  try {
    const response = await apiFetch("/api/perf/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Test run failed.");
    }

    activeJobId = payload.jobId;
    runStatusEl.textContent = `Job queued: ${payload.testName}`;

    await pollJob(activeJobId);
    pollTimer = setInterval(async () => {
      try {
        await pollJob(activeJobId);
      } catch (error) {
        runStatusEl.textContent = error.message;
        setRunSubmissionBusy(false);
        setCancelButtonsVisible(false);
        stopPolling();
      }
    }, 1000);
  } catch (error) {
    runStatusEl.textContent = error.message;
    setRunSubmissionBusy(false);
    setCancelButtonsVisible(false);
  }
});

cancelJobBtn.addEventListener("click", async () => {
  if (!activeJobId) {
    return;
  }

  try {
    const response = await apiFetch(`/api/perf/jobs/${activeJobId}/cancel`, {
      method: "POST"
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Failed to cancel job.");
    }

    runStatusEl.textContent = `Cancel requested for job: ${payload.jobId}`;
  } catch (error) {
    runStatusEl.textContent = error.message;
  }
});

if (cancelQueryBtn) {
  cancelQueryBtn.addEventListener("click", () => {
    cancelJobBtn.click();
  });
}

provisionRedisBtn.addEventListener("click", () => {
  const selected = redisSkuSelectEl.value || "M20";
  queryConfigStatusEl.textContent =
    `Azure Managed Redis size selected: ${selected}. Current deployed cache: docdb-perf-redis-71463.`;
});

runQueryBtn.addEventListener("click", () => {
  document.getElementById("operationType").value = "query";
  updateRequestSummary();
  runForm.requestSubmit();
});

myTestsWrapEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='view-my-test']");
  if (!button) {
    return;
  }

  try {
    await loadJobDetails(button.dataset.id, "/api/reports/my-tests");
  } catch (error) {
    runStatusEl.textContent = error.message;
  }
});

adminTestsWrapEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='view-admin-test']");
  if (!button) {
    return;
  }

  try {
    await loadJobDetails(button.dataset.id, "/api/admin/tests");
  } catch (error) {
    runStatusEl.textContent = error.message;
  }
});

downloadCsvEl.addEventListener("click", () => {
  if (!activeJobId) return;
  window.open(`/api/perf/jobs/${activeJobId}/export?format=csv`, "_blank");
});

downloadPdfEl.addEventListener("click", () => {
  if (!activeJobId) return;
  window.open(`/api/perf/jobs/${activeJobId}/export?format=pdf`, "_blank");
});

bindToolbarActions();
updateRequestSummary();
toggleAuthenticatedUI(false);
checkSession();

