"use client";

import React, { useState, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";

const ROWS: Array<{ id: string; dimension: string; weight: string; measures: string }> = [
  { id: "D1", dimension: "Structured Attribute Completeness", weight: "25%", measures: "Core PDP fields: name, price, category, image_urls, brand, variants." },
  { id: "D2", dimension: "Descriptive Richness", weight: "15%", measures: "Long-form description length, material/composition detail, care info, fit guidance." },
  { id: "D3", dimension: "Conversational Q&A Coverage (ACP q_and_a)", weight: "20%", measures: "Presence and quality of pre-baked question-answer pairs an agent can cite." },
  { id: "D4", dimension: "Review Signal Presence (ACP raw_review_data)", weight: "10%", measures: "Whether the record carries review data (even just summary-level)." },
  { id: "D5", dimension: "Relational Context (ACP relationship_type)", weight: "15%", measures: "Presence of often_bought_with / substitute / complementary links." },
  { id: "D6", dimension: "Agent-Actionable Facets", weight: "15%", measures: "Structured, filterable facets: size, color, material, occasion, fit, care, weather_suitability, price_band." },
];

export default function RubricInfo() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View scoring rubric"
        title="View scoring rubric"
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold">UCP/ACP Readiness Rubric</h3>
                <p className="text-sm text-white/50 mt-1">
                  Six weighted dimensions. Overall score = Σ (dimension × weight). Gaps trigger when a dimension scores &lt; 6.0.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-white/50 hover:text-white p-2 -mr-2 -mt-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white/70 uppercase tracking-wider bg-slate-950 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 font-semibold w-16">#</th>
                    <th className="px-4 py-3 font-semibold">Dimension</th>
                    <th className="px-4 py-3 font-semibold w-24">Weight</th>
                    <th className="px-4 py-3 font-semibold">What it measures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ROWS.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-mono text-purple-300">{row.id}</td>
                      <td className="px-4 py-3 text-white/90">{row.dimension}</td>
                      <td className="px-4 py-3 font-mono text-white/80">{row.weight}</td>
                      <td className="px-4 py-3 text-white/70">{row.measures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20 text-center">
              <button
                onClick={() => setOpen(false)}
                className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
