import { reviewCase } from "./engine.mjs";
import { explainCase } from "../explainability.mjs";

const input = document.getElementById("caseData");
const main = document.querySelector("main");

if (!input || !main) {
  throw Error("EvidenceForge workspace unavailable");
}

function el(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }

  if (className) node.className = className;

  return node;
}

const section = el(
  "section",
  undefined,
  "input"
);

section.id = "explainability-lab";
section.style.marginTop = "24px";

section.append(
  el("small", "04 / EXPLAINABLE INVESTIGATION"),
  el("h2", "Evidence Intelligence Lab"),
  el(
    "p",
    "Explainable evidence review, declared contradictions, and hypothesis impact analysis. All processing remains local."
  )
);

const toolbar = el("div", undefined, "actions");

const analyze = el(
  "button",
  "Run Evidence Intelligence",
  "primary"
);

analyze.type = "button";
toolbar.append(analyze);

const status = el(
  "p",
  "Load or paste a case JSON to begin."
);

status.setAttribute("role", "status");

const output = el("div");
output.setAttribute("aria-live", "polite");

section.append(toolbar, status, output);
main.append(section);

function card(title, lines) {
  const article = el(
    "article",
    undefined,
    "evidence-entry"
  );

  article.append(el("h3", title));

  for (const line of lines) {
    article.append(el("p", line));
  }

  output.append(article);
}

function runAnalysis() {
  output.replaceChildren();

  try {
    if (input.value.length > 2 * 1024 * 1024) {
      throw Error("Case exceeds 2 MB input limit");
    }

    const doc = JSON.parse(input.value);
    const reviewed = reviewCase(doc);
    const result = explainCase(doc, reviewed);

    status.textContent =
      `Completed evidence review for ${result.case_id}`;

    output.append(
      el("h3", "Explainable Findings")
    );

    if (!result.findings.length) {
      output.append(
        el(
          "p",
          "No findings produced by the current rules. This does not establish that the evidence is complete or consistent."
        )
      );
    }

    for (const finding of result.findings) {
      card(finding.code, [
        `Severity: ${finding.severity}`,
        `Evidence: ${finding.evidence_ids.join(", ") || "Not specified"}`,
        finding.explanation,
        `Recommended check: ${finding.recommended_check}`,
        "Status: Human review required"
      ]);
    }

    output.append(
      el("h3", "Potentially Influential Evidence")
    );

    if (!result.decisive_candidates.length) {
      output.append(
        el(
          "p",
          "No hypothesis impact candidates identified."
        )
      );
    }

    for (const item of result.decisive_candidates) {
      card(item.root_evidence_id, [
        `Hypotheses affected: ${item.hypothesis_count}`,
        `Hypothesis IDs: ${item.hypotheses_affected.join(", ")}`,
        item.reason
      ]);
    }

    output.append(
      el("h3", "Investigation Limitations")
    );

    for (const warning of result.caveats) {
      output.append(el("p", warning));
    }

    const exportButton = el(
      "button",
      "Export Explainability Report"
    );

    exportButton.type = "button";

    exportButton.addEventListener("click", () => {
      const blob = new Blob(
        [JSON.stringify(result, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        "evidenceforge-explainability.json";

      link.click();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    });

    output.append(exportButton);

  } catch (error) {
    status.textContent =
      `Analysis failed: ${error.message}`;

    output.replaceChildren(
      el(
        "p",
        "Please verify case data and evidence references."
      )
    );
  }
}

analyze.addEventListener("click", runAnalysis);
