import { reviewCase } from "./engine.mjs";
import { analyzeHypotheses } from "./hypotheses.mjs";

const scenario = {
  case_id: "EFX-SYNTHETIC-ATTRIBUTION",
  evidence: [
    { id: "BANK", source: "Bank statement" },
    { id: "LOGIN", source: "Login audit export" },
    {
      id: "LOGIN_COPY",
      source: "Login audit export",
      derived_from: "LOGIN"
    },
    { id: "DEVICE", source: "Device forensic export" }
  ],
  events: [
    {
      id: "EVENT1",
      timestamp: "2026-10-30T09:00:00+03:00",
      description: "Synthetic login recorded",
      evidence_ids: ["LOGIN"]
    },
    {
      id: "EVENT2",
      timestamp: "2026-10-30T09:12:00+03:00",
      description: "Synthetic transfer recorded",
      evidence_ids: ["BANK"]
    }
  ],
  links: [
    { from: "LOGIN", to: "LOGIN_COPY", type: "derived_from" },
    { from: "BANK", to: "DEVICE", type: "references" }
  ],
  hypotheses: [
    {
      id: "H1",
      title: "Account owner initiated the transaction",
      supports: ["BANK"],
      challenges: ["DEVICE"],
      gaps: [{
        question: "Who controlled the device at transaction time?",
        why: "Account ownership does not establish actual device use.",
        discriminator: "device-control"
      }]
    },
    {
      id: "H2",
      title: "Another person accessed the account",
      supports: ["LOGIN", "LOGIN_COPY"],
      challenges: [],
      gaps: [{
        question: "Can device control be independently verified?",
        why: "The login record does not identify the physical operator.",
        discriminator: "device-control"
      }]
    },
    {
      id: "H3",
      title: "Available evidence cannot establish the operator",
      supports: ["BANK", "LOGIN"],
      challenges: [],
      gaps: [{
        question: "Is independent operator evidence available?",
        why: "The current records establish activity, not identity.",
        discriminator: "operator-attribution"
      }]
    }
  ]
};

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

const section = node("section", undefined, "input");
section.style.marginTop = "24px";
section.id = "hypothesis-workspace";

section.appendChild(node("small", "02 / REASONING LAB"));
section.appendChild(node("h2", "Competing Hypotheses"));
section.appendChild(node(
  "p",
  "Compare alternative explanations without assigning guilt or artificial probabilities."
));

const run = node("button", "Run hypothesis comparison", "primary");
run.type = "button";

const output = node("div");
output.id = "hypothesis-results";
output.setAttribute("aria-live", "polite");

run.addEventListener("click", () => {
  output.replaceChildren();

  try {
    const review = reviewCase(scenario);
    const analysis = analyzeHypotheses(scenario, review);

    output.appendChild(node(
      "h3",
      `${analysis.hypotheses.length} competing explanations`
    ));

    for (const h of analysis.hypotheses) {
      const card = node("article", undefined, "evidence-entry");
      card.appendChild(node("h3", `${h.id} — ${h.title}`));

      card.appendChild(node(
        "p",
        `Supporting evidence: ${
          h.supporting_evidence.map(e => e.id).join(", ") || "None supplied"
        }`
      ));

      card.appendChild(node(
        "p",
        `Challenging evidence: ${
          h.challenging_evidence.map(e => e.id).join(", ") || "None supplied"
        }`
      ));

      card.appendChild(node(
        "p",
        `Distinct support roots: ${h.independent_support_roots.length}`
      ));

      for (const gap of h.unanswered_questions) {
        card.appendChild(node("p", `Missing evidence: ${gap.question}`));
      }

      for (const warning of h.warnings) {
        card.appendChild(node("p", `Caution: ${warning}`));
      }

      output.appendChild(card);
    }

    output.appendChild(node("h3", "Investigative priorities"));

    for (const q of analysis.prioritized_questions) {
      output.appendChild(node(
        "p",
        `${q.question} — Relevant to ${
          q.cross_hypothesis_relevance
        } hypothesis group(s).`
      ));
    }

    output.appendChild(node(
      "p",
      "Synthetic demonstration only. All hypotheses remain unresolved."
    ));

  } catch (error) {
    output.replaceChildren();
    output.appendChild(node(
      "p",
      `Analysis error: ${error.message}`
    ));
  }
});

section.append(run, output);
document.querySelector("main")?.appendChild(section);
