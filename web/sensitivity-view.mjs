import { reviewCase } from "./engine.mjs";
import { analyzeHypotheses } from "./hypotheses.mjs";
import { auditEvidenceDependence } from "./sensitivity.mjs";

/*
 * EvidenceForge X — Evidence Sensitivity Lab
 * Local, deterministic, read-only investigation simulation.
 */

const input = document.getElementById("caseData");
const main = document.querySelector("main");

function make(tag, text, className) {
  const element = document.createElement(tag);

  if (text !== undefined) {
    element.textContent = String(text);
  }

  if (className) {
    element.className = className;
  }

  return element;
}

if (!input || !main) {
  throw Error("EvidenceForge workspace unavailable");
}

const section = make("section", undefined, "input");
section.id = "sensitivity-lab";
section.style.marginTop = "24px";

section.append(
  make("small", "03 / EVIDENCE SENSITIVITY LAB"),
  make("h2", "Evidence Dependence Audit"),
  make(
    "p",
    "Remove an evidence item hypothetically and examine how its exclusion and derived copies affect competing hypotheses."
  )
);

const select = make("select");
select.setAttribute("aria-label", "Evidence to exclude");
select.style.width = "100%";
select.style.padding = "13px";
select.style.margin = "12px 0";
select.style.background = "#091322";
select.style.color = "#eff6ff";
select.style.border = "1px solid #2a3c54";
select.style.borderRadius = "9px";

const refresh = make("button", "Load evidence from current case");
const run = make("button", "Simulate evidence exclusion", "primary");

refresh.type = "button";
run.type = "button";

const controls = make("div", undefined, "actions");
controls.style.flexWrap = "wrap";
controls.append(refresh, run);

const status = make(
  "p",
  "Load an advanced case with hypotheses before running the audit."
);
status.setAttribute("role", "status");

const results = make("div");
results.setAttribute("aria-live", "polite");

section.append(select, controls, status, results);
main.append(section);

let currentCase = null;

function readCase() {
  if (input.value.length > 2 * 1024 * 1024) {
    throw Error("Case exceeds 2 MB");
  }

  const doc = JSON.parse(input.value);

  reviewCase(doc);
  analyzeHypotheses(doc, reviewCase(doc));

  if (!doc.hypotheses?.length) {
    throw Error("Case has no hypotheses");
  }

  return doc;
}

function loadEvidence() {
  results.replaceChildren();
  select.replaceChildren();
  currentCase = null;

  try {
    const doc = readCase();

    for (const item of doc.evidence) {
      const option = make(
        "option",
        `${item.id} — ${item.source}`
      );
      option.value = item.id;
      select.append(option);
    }

    if (!doc.evidence.length) {
      throw Error("No evidence items available");
    }

    currentCase = doc;
    status.textContent =
      `${doc.evidence.length} evidence items ready for hypothetical exclusion.`;

  } catch (error) {
    status.textContent =
      `Unable to load evidence: ${error.message}`;
  }
}

function entry(title, lines) {
  const card = make("article", undefined, "evidence-entry");
  card.append(make("h3", title));

  for (const line of lines) {
    card.append(make("p", line));
  }

  results.append(card);
}

function audit() {
  results.replaceChildren();

  try {
    if (!currentCase) {
      throw Error("Load evidence first");
    }

    const selected = select.value;

    if (!selected) {
      throw Error("Select evidence to exclude");
    }

    const report = auditEvidenceDependence(
      currentCase,
      selected
    );

    status.textContent =
      `Simulation complete. ${report.total_excluded_items} evidence item(s) excluded hypothetically.`;

    entry("Exclusion scenario", [
      `Selected evidence: ${report.excluded_evidence_id}`,
      `Derived items also excluded: ${
        report.automatically_excluded_descendants.join(", ") ||
        "None"
      }`,
      "Original case data remain unchanged."
    ]);

    for (const h of report.affected_hypotheses) {
      entry(`${h.hypothesis_id} — ${h.title}`, [
        `Support roots: ${h.original_support_roots} → ${h.remaining_support_roots}`,
        `Challenge roots: ${h.original_challenge_roots} → ${h.remaining_challenge_roots}`,
        `Lost support sources: ${
          h.lost_support_root_ids.join(", ") || "None"
        }`,
        `Lost challenging sources: ${
          h.lost_challenge_root_ids.join(", ") || "None"
        }`,
        `No remaining supporting evidence: ${
          h.has_no_remaining_support ? "Yes" : "No"
        }`,
        h.interpretation
      ]);
    }

    entry("Important limitations", report.cautions);

  } catch (error) {
    status.textContent =
      `Simulation failed: ${error.message}`;
  }
}

refresh.addEventListener("click", loadEvidence);
run.addEventListener("click", audit);

input.addEventListener("input", () => {
  currentCase = null;
  select.replaceChildren();
  results.replaceChildren();
  status.textContent =
    "Case data changed. Load evidence again.";
});
