/**
 * EvidenceForge X
 * Chain of Custody Review — Browser UI
 * Local processing; human verification required.
 */

import { auditCustody } from "./custody.mjs";

const input = document.getElementById("caseData");
const main = document.querySelector("main");

if (!input || !main) {
  throw Error("EvidenceForge workspace unavailable");
}

const MAX_SIZE = 2 * 1024 * 1024;

function el(tag, value, className) {
  const node = document.createElement(tag);

  if (value !== undefined && value !== null) {
    node.textContent = String(value);
  }

  if (className) {
    node.className = className;
  }

  return node;
}

function card(title, details, target) {
  const article = el(
    "article",
    undefined,
    "evidence-entry"
  );

  article.append(el("h3", title));

  for (const detail of details) {
    article.append(el("p", detail));
  }

  target.append(article);
}

const section = el("section", null, "input");
section.id = "custody-workspace";
section.style.marginTop = "24px";

section.append(
  el("small", "06 / FORENSIC INTEGRITY"),
  el("h2", "Chain of Custody Audit"),
  el(
    "p",
    "Review documented evidence handling, collection, " +
    "transfers, receipts and integrity gaps. " +
    "No automatic authenticity certification."
  )
);

const controls = el("div", null, "actions");

const runButton = el(
  "button",
  "Audit custody records",
  "primary"
);

const exportButton = el(
  "button",
  "Export custody report"
);

runButton.type = "button";
exportButton.type = "button";
exportButton.disabled = true;

controls.append(runButton, exportButton);

const status = el(
  "p",
  "Load a case JSON document to begin."
);

status.setAttribute("role", "status");

const summary = el("div");
summary.className = "metrics";
summary.style.marginTop = "16px";

const output = el("div");
output.setAttribute("aria-live", "polite");

section.append(controls, status, summary, output);
main.append(section);

let currentReport = null;

function metric(label, value) {
  const box = el("div", null, "metric");
  box.append(
    el("small", label),
    el("strong", String(value))
  );
  summary.append(box);
}

function render(report) {
  summary.replaceChildren();
  output.replaceChildren();

  const totalEvents = report.trails.reduce(
    (count, trail) => count + trail.events.length,
    0
  );

  metric("EVIDENCE ITEMS", report.trails.length);
  metric("CUSTODY EVENTS", totalEvents);
  metric("REVIEW FINDINGS", report.findings.length);

  output.append(
    el("h3", "Documented custody trails")
  );

  for (const trail of report.trails) {
    const details = trail.events.length
      ? trail.events.map(event =>
          event.timestamp_utc +
          " | " +
          event.action.toUpperCase() +
          " | " +
          event.actor +
          " | " +
          event.id
        )
      : ["No custody events supplied."];

    card(
      "Evidence: " + trail.evidence_id,
      details,
      output
    );
  }

  output.append(el("h3", "Integrity review findings"));

  if (!report.findings.length) {
    output.append(
      el(
        "p",
        "No issues identified by these specific rules. " +
        "This does not certify evidence authenticity."
      )
    );
  }

  for (const finding of report.findings) {
    card(
      finding.code,
      [
        "Evidence: " + finding.evidence_id,
        "Severity: " + finding.severity,
        finding.message,
        "Human review required"
      ],
      output
    );
  }

  output.append(el("h3", "Important limitations"));

  for (const limitation of report.limitations) {
    output.append(el("p", limitation));
  }
}

function runAudit() {
  currentReport = null;
  exportButton.disabled = true;
  summary.replaceChildren();
  output.replaceChildren();

  try {
    if (input.value.length > MAX_SIZE) {
      throw Error("Case JSON exceeds 2 MB limit");
    }

    const doc = JSON.parse(input.value);

    const report = auditCustody(doc);

    render(report);

    currentReport = report;
    exportButton.disabled = false;

    status.textContent =
      "Custody audit completed for " + report.case_id;

  } catch (error) {
    status.textContent =
      "Custody audit failed: " + error.message;

    output.append(
      el(
        "p",
        "Check the JSON data and custody references."
      )
    );
  }
}

function exportReport() {
  if (!currentReport) return;

  const blob = new Blob(
    [JSON.stringify(currentReport, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "evidenceforge-custody.json";

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

runButton.addEventListener("click", runAudit);

exportButton.addEventListener(
  "click",
  exportReport
);

input.addEventListener("input", () => {
  currentReport = null;
  exportButton.disabled = true;
  summary.replaceChildren();
  output.replaceChildren();

  status.textContent =
    "Case data changed. Run the custody audit again.";
});
