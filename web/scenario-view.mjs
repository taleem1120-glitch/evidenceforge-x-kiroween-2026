
/**
 * EvidenceForge X
 * Scenario Explorer — browser-local investigation UI.
 * No automated attribution or guilt assessment.
 */

import { reconstructScenarios } from "./scenario-engine.mjs";

const input = document.getElementById("caseData");
const main = document.querySelector("main");

if (!input || !main) {
  throw Error("EvidenceForge workspace not found");
}

const MAX_SIZE = 2 * 1024 * 1024;

function el(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }

  if (className) node.className = className;

  return node;
}

function card(title, lines, target) {
  const article = el("article", null, "evidence-entry");
  article.append(el("h3", title));

  for (const line of lines) {
    article.append(el("p", line));
  }

  target.append(article);
  return article;
}

const section = el("section", null, "input");
section.id = "scenario-explorer";
section.style.marginTop = "24px";

section.append(
  el("small", "05 / SCENARIO RECONSTRUCTION"),
  el("h2", "Alternative Scenario Explorer"),
  el(
    "p",
    "Compare competing explanations, evidence origins, " +
    "timeline events and investigative gaps. " +
    "All processing remains inside your browser."
  )
);

const toolbar = el("div", null, "actions");

const runButton = el(
  "button",
  "Reconstruct scenarios",
  "primary"
);
runButton.type = "button";

const exportButton = el(
  "button",
  "Export scenario report"
);
exportButton.type = "button";
exportButton.disabled = true;

toolbar.append(runButton, exportButton);

const status = el(
  "p",
  "Load an advanced synthetic case containing hypotheses."
);
status.setAttribute("role", "status");

const output = el("div");
output.setAttribute("aria-live", "polite");

section.append(toolbar, status, output);
main.append(section);

let currentReport = null;

function listText(values) {
  return Array.isArray(values) && values.length
    ? values.join(", ")
    : "None recorded";
}

function renderTimeline(events, target) {
  target.append(el("h3", "Chronological observations"));

  if (!events.length) {
    target.append(el("p", "No related events recorded."));
    return;
  }

  for (const event of events) {
    card(event.description, [
      "UTC: " + event.timestamp_utc,
      "Event: " + event.id,
      "Evidence: " + listText(event.evidence_ids)
    ], target);
  }
}

function renderScenario(scenario) {
  const container = el("section", null, "evidence-entry");

  container.append(
    el("h3", scenario.id + " — " + scenario.title),
    el("p", "Status: unresolved"),
    el(
      "p",
      "Supporting evidence origins: " +
      listText(scenario.supporting_roots)
    ),
    el(
      "p",
      "Challenging evidence origins: " +
      listText(scenario.challenging_roots)
    ),
    el(
      "p",
      "Overlapping evidence origins: " +
      listText(scenario.overlapping_roots)
    )
  );

  if (scenario.declared_contradictions.length) {
    container.append(
      el("h3", "Declared contradictions")
    );

    for (const contradiction of
      scenario.declared_contradictions) {
      container.append(
        el(
          "p",
          contradiction.from + " ↔ " +
          contradiction.to +
          " — requires human verification"
        )
      );
    }
  }

  if (scenario.investigative_gaps.length) {
    container.append(
      el("h3", "Investigative gaps")
    );

    for (const gap of scenario.investigative_gaps) {
      container.append(
        el("p", gap.question + " — " + gap.reason)
      );
    }
  }

  for (const caution of scenario.cautions) {
    container.append(el("p", "Caution: " + caution));
  }

  renderTimeline(scenario.related_events, container);
  output.append(container);
}

function renderReport(report) {
  output.replaceChildren();

  output.append(
    el("h3", "Case: " + report.case_id),
    el(
      "p",
      report.scenarios.length +
      " alternative scenarios reviewed."
    )
  );

  if (!report.scenarios.length) {
    output.append(
      el("p", "No hypotheses were supplied.")
    );
  }

  for (const scenario of report.scenarios) {
    renderScenario(scenario);
  }

  output.append(el("h3", "Investigative priorities"));

  for (const question of report.investigative_questions) {
    card(question.question, [
      "Reason: " + question.reason,
      "Scenario: " + question.related_scenario,
      "Shared relevance: " +
        question.cross_scenario_relevance
    ], output);
  }

  output.append(el("h3", "Unreferenced evidence"));

  output.append(
    el(
      "p",
      listText(report.unreferenced_evidence_ids)
    )
  );

  output.append(el("h3", "Limitations"));

  for (const warning of report.disclaimers) {
    output.append(el("p", warning));
  }
}

function run() {
  currentReport = null;
  exportButton.disabled = true;
  output.replaceChildren();

  try {
    if (input.value.length > MAX_SIZE) {
      throw Error("Case exceeds the 2 MB limit");
    }

    const doc = JSON.parse(input.value);

    if (
      !Array.isArray(doc.hypotheses) ||
      !doc.hypotheses.length
    ) {
      throw Error(
        "No hypotheses found. Load the advanced " +
        "synthetic case first."
      );
    }

    const report = reconstructScenarios(doc);

    renderReport(report);

    currentReport = report;
    exportButton.disabled = false;

    status.textContent =
      "Reconstruction completed for " + report.case_id;

  } catch (error) {
    status.textContent =
      "Reconstruction failed: " + error.message;

    output.replaceChildren(
      el(
        "p",
        "Check the case JSON and evidence references."
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
  link.download = "evidenceforge-scenarios.json";

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

runButton.addEventListener("click", run);
exportButton.addEventListener("click", exportReport);

input.addEventListener("input", () => {
  currentReport = null;
  exportButton.disabled = true;
  output.replaceChildren();

  status.textContent =
    "Case data changed. Reconstruct scenarios again.";
});
