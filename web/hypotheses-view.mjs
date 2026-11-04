import { reviewCase } from "./engine.mjs";
import { analyzeHypotheses } from "./hypotheses.mjs";

// Local processing only. No network requests.
const demo = {
  case_id: "EFX-SYNTHETIC-ATTRIBUTION",

  evidence: [
    { id: "BANK", source: "Bank transaction record" },
    { id: "LOGIN", source: "Login audit record" },
    {
      id: "LOGIN_COPY",
      source: "Login audit record",
      derived_from: "LOGIN"
    },
    { id: "DEVICE", source: "Device forensic record" }
  ],

  events: [
    {
      id: "EV1",
      timestamp: "2026-10-30T09:00:00+03:00",
      description: "Synthetic login observed",
      evidence_ids: ["LOGIN"]
    },
    {
      id: "EV2",
      timestamp: "2026-10-30T09:12:00+03:00",
      description: "Synthetic payment observed",
      evidence_ids: ["BANK"]
    }
  ],

  links: [
    {
      from: "LOGIN",
      to: "LOGIN_COPY",
      type: "derived_from"
    },
    {
      from: "BANK",
      to: "DEVICE",
      type: "references"
    }
  ],

  hypotheses: [
    {
      id: "H1",
      title: "Account owner initiated the transaction",
      supports: ["BANK"],
      challenges: ["DEVICE"],
      gaps: [{
        question: "Who controlled the device at transaction time?",
        why: "Account ownership does not establish device use.",
        discriminator: "device-control"
      }]
    },
    {
      id: "H2",
      title: "Another person operated the account",
      supports: ["LOGIN", "LOGIN_COPY"],
      challenges: [],
      gaps: [{
        question: "Can control of the device be independently verified?",
        why: "A login does not identify the physical operator.",
        discriminator: "device-control"
      }]
    },
    {
      id: "H3",
      title: "Operator cannot be established from supplied evidence",
      supports: ["BANK", "LOGIN"],
      challenges: [],
      gaps: [{
        question: "What independent attribution evidence is available?",
        why: "Current evidence shows activity, not operator identity.",
        discriminator: "operator-attribution"
      }]
    }
  ]
};

function el(tag, text, className) {
  const item = document.createElement(tag);

  if (text !== undefined) {
    item.textContent = String(text);
  }

  if (className) item.className = className;
  return item;
}

const main = document.querySelector("main");
const input = document.getElementById("caseData");

if (!main || !input) {
  throw Error("EvidenceForge workspace not found");
}

const section = el("section", undefined, "input");
section.id = "hypothesis-workspace";
section.style.marginTop = "24px";

section.append(
  el("small", "02 / HYPOTHESIS LAB"),
  el("h2", "Competing Hypotheses"),
  el(
    "p",
    "Compare investigator-entered hypotheses from the case JSON above. No automated guilt assessment or artificial probabilities."
  )
);

const toolbar = el("div", undefined, "actions");

const load = el(
  "button",
  "Load advanced synthetic case"
);

const compare = el(
  "button",
  "Analyze current case",
  "primary"
);

load.type = "button";
compare.type = "button";

toolbar.append(load, compare);
section.append(toolbar);

const status = el(
  "p",
  "Your case JSON needs a hypotheses array."
);

status.setAttribute("role", "status");
section.append(status);

const output = el("div");
output.id = "hypothesis-results";
output.setAttribute("aria-live", "polite");

section.append(output);
main.append(section);

function card(title, details, parent) {
  const item = el(
    "article",
    undefined,
    "evidence-entry"
  );

  item.append(el("h3", title));

  for (const line of details) {
    item.append(el("p", line));
  }

  parent.append(item);
}

function run() {
  output.replaceChildren();

  try {
    if (input.value.length > 2 * 1024 * 1024) {
      throw Error("Case exceeds 2 MB limit");
    }

    const doc = JSON.parse(input.value);

    if (!Array.isArray(doc.hypotheses) ||
        !doc.hypotheses.length) {
      throw Error(
        "No hypotheses found. Add hypotheses or load the advanced example."
      );
    }

    const reviewed = reviewCase(doc);
    const result = analyzeHypotheses(
      doc,
      reviewed
    );

    status.textContent =
      `Reviewed ${result.hypotheses.length} hypotheses for ${result.case_id}. All remain unresolved.`;

    output.append(el(
      "h3",
      `${result.hypotheses.length} competing explanations`
    ));

    for (const h of result.hypotheses) {
      const details = [
        `Supporting evidence: ${
          h.supporting_evidence.map(e => e.id).join(", ") ||
          "None supplied"
        }`,

        `Challenging evidence: ${
          h.challenging_evidence.map(e => e.id).join(", ") ||
          "None supplied"
        }`,

        `Distinct source roots supplied: ${
          h.independent_support_roots.length
        } (not a statistical independence measure)`,

        ...h.unanswered_questions.map(g =>
          `Investigative question: ${g.question} — ${g.why}`
        ),

        ...h.warnings.map(w =>
          `Caution: ${w}`
        )
      ];

      card(
        `${h.id} — ${h.title}`,
        details,
        output
      );
    }

    output.append(el(
      "h3",
      "Investigative priorities"
    ));

    if (!result.prioritized_questions.length) {
      output.append(el(
        "p",
        "No investigative questions supplied."
      ));
    }

    for (const q of result.prioritized_questions) {
      card(q.question, [
        `Hypothesis: ${q.hypothesis_id}`,
        `Reason: ${q.why}`,
        `Shared discriminator: ${q.discriminator} (${q.cross_hypothesis_relevance} hypotheses)`
      ], output);
    }

    output.append(el(
      "p",
      "Structured consistency review only. Not an automated attribution or finding of fact."
    ));

  } catch (error) {
    status.textContent =
      `Unable to analyze: ${error.message}`;

    output.replaceChildren(el(
      "p",
      "Check the JSON and evidence references. No results were produced."
    ));
  }
}

load.addEventListener("click", () => {
  if (
    input.value.trim() &&
    !window.confirm(
      "Replace current JSON with synthetic demonstration data?"
    )
  ) {
    return;
  }

  input.value = JSON.stringify(
    demo,
    null,
    2
  );

  status.textContent =
    "Advanced case loaded. Select Analyze current case.";

  output.replaceChildren();
});

compare.addEventListener("click", run);
