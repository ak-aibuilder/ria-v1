"use client";

import React, { useEffect, useState } from 'react';
import { useAppStore, ScoredProduct, Gap } from '../lib/store';
import { AlertTriangle, CheckCircle, Info, Sparkles, ArrowRight, BarChart3 } from 'lucide-react';

// Mock scoring logic
const generateMockScores = (products: any[]): ScoredProduct[] => {
  return products.map(p => {
    // Base scores on what data is present
    const hasDesc = p.description && p.description.length > 20;
    const hasCategory = !!p.category;
    const hasBrand = !!p.brand;

    const d1 = hasCategory && hasBrand ? 7.5 : 4.0; // Structured Attributes
    const d2 = hasDesc ? 6.5 : 3.0; // Description
    const d3 = 2.0; // Q&A (usually missing)
    const d4 = 3.5; // Reviews (usually missing or sparse)
    const d5 = 4.0; // Relationships (usually missing)
    const d6 = 2.5; // Agent Facets (usually missing)

    // Add some randomness for realism
    const randomize = (base: number) => Math.max(1, Math.min(10, base + (Math.random() * 2 - 1)));

    const scores = {
      D1: randomize(d1),
      D2: randomize(d2),
      D3: randomize(d3),
      D4: randomize(d4),
      D5: randomize(d5),
      D6: randomize(d6),
    };

    const readiness_score = (
      scores.D1 * 0.25 +
      scores.D2 * 0.15 +
      scores.D3 * 0.20 +
      scores.D4 * 0.10 +
      scores.D5 * 0.15 +
      scores.D6 * 0.15
    );

    const gaps: Gap[] = [];
    if (scores.D1 < 6) gaps.push({ dimension: 'D1', severity: 'high', reason: 'Missing structured attributes (brand, category, material)' });
    if (scores.D2 < 6) gaps.push({ dimension: 'D2', severity: 'medium', reason: 'Description is too short or lacks detail for agent reasoning' });
    if (scores.D3 < 6) gaps.push({ dimension: 'D3', severity: 'high', reason: 'No conversational Q&A pairs available' });
    if (scores.D5 < 6) gaps.push({ dimension: 'D5', severity: 'medium', reason: 'Missing product relationships (complements, alternatives)' });
    if (scores.D6 < 6) gaps.push({ dimension: 'D6', severity: 'high', reason: 'Missing agent-actionable facets (e.g., "good for winter", "waterproof")' });

    return {
      sku: p.sku,
      readiness_score,
      dimension_scores: scores,
      gaps
    };
  });
};

export default function AuditView() {
  const { state, setScoredProducts, setPhase } = useAppStore();
  const [isScoring, setIsScoring] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ScoredProduct | null>(null);

  useEffect(() => {
    if (state.scoredProducts.length === 0 && state.products.length > 0) {
      // Simulate API delay
      const timer = setTimeout(() => {
        const scores = generateMockScores(state.products);
        setScoredProducts(scores);
        setIsScoring(false);
      }, 2000);
      return () => clearTimeout(timer);
    } else if (state.scoredProducts.length > 0) {
      setIsScoring(false);
    }
  }, [state.products, state.scoredProducts.length, setScoredProducts]);

  if (isScoring) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-purple-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-purple-500 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
        </div>
        <h3 className="text-2xl font-bold mb-2">Auditing Catalog</h3>
        <p className="text-white/60">Analyzing {state.products.length} products against UCP/ACP standards...</p>
      </div>
    );
  }

  const avgScore = state.scoredProducts.reduce((acc, p) => acc + p.readiness_score, 0) / state.scoredProducts.length;
  const needsEnrichment = state.scoredProducts.filter(p => p.readiness_score < 7).length;

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (score >= 6) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
            Readiness Audit Results
          </h2>
          <p className="text-lg text-white/70 max-w-2xl">
            Your catalog has been scored against Agentic Commerce Protocol standards. 
            Products scoring below 7.0 will cause AI agents to hallucinate or fail.
          </p>
        </div>
        
        <button 
          onClick={() => setPhase('enrich')}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 transform hover:-translate-y-0.5 whitespace-nowrap"
        >
          <Sparkles className="w-5 h-5" />
          Enrich Catalog
          <ArrowRight className="w-5 h-5 ml-1" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <div className="text-white/50 text-sm font-medium mb-2 uppercase tracking-wider">Average Readiness</div>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-bold">{avgScore.toFixed(1)}</div>
            <div className="text-white/50 mb-1">/ 10</div>
          </div>
          <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full ${getScoreBg(avgScore)}`} style={{ width: `${(avgScore / 10) * 100}%` }} />
          </div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <div className="text-white/50 text-sm font-medium mb-2 uppercase tracking-wider">Products at Risk</div>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-bold text-red-400">{needsEnrichment}</div>
            <div className="text-white/50 mb-1">/ {state.products.length}</div>
          </div>
          <p className="mt-4 text-sm text-white/60">Require enrichment for agent use</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <div className="text-white/50 text-sm font-medium mb-2 uppercase tracking-wider">Primary Gaps</div>
          <ul className="space-y-2 mt-2">
            <li className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>Conversational Q&A (D3)</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>Agent Facets (D6)</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>Relationships (D5)</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-xl font-semibold">Product Scorecard Heatmap</h3>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500/50" /> Ready (8-10)</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500/50" /> Marginal (6-7.9)</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/50" /> Gap (&lt;6)</div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white/50 uppercase bg-black/20 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Product</th>
                <th className="px-4 py-4 font-medium text-center">Overall</th>
                <th className="px-4 py-4 font-medium text-center" title="Structured Attributes">D1: Attr</th>
                <th className="px-4 py-4 font-medium text-center" title="Description">D2: Desc</th>
                <th className="px-4 py-4 font-medium text-center" title="Q&A">D3: Q&A</th>
                <th className="px-4 py-4 font-medium text-center" title="Reviews">D4: Rev</th>
                <th className="px-4 py-4 font-medium text-center" title="Relationships">D5: Rel</th>
                <th className="px-4 py-4 font-medium text-center" title="Agent Facets">D6: Facet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {state.scoredProducts.map((product) => {
                const baseProduct = state.products.find(p => p.sku === product.sku);
                return (
                  <tr 
                    key={product.sku} 
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium">{baseProduct?.name}</div>
                      <div className="text-xs text-white/50 font-mono mt-1">{product.sku}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border font-bold ${getScoreColor(product.readiness_score)}`}>
                        {product.readiness_score.toFixed(1)}
                      </span>
                    </td>
                    {['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map((d) => {
                      const score = product.dimension_scores[d as keyof typeof product.dimension_scores];
                      return (
                        <td key={d} className="px-4 py-4 text-center">
                          <div className={`w-full h-8 rounded flex items-center justify-center font-medium ${getScoreColor(score).replace('border', 'border-0')}`}>
                            {score.toFixed(1)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold">{state.products.find(p => p.sku === selectedProduct.sku)?.name}</h3>
                <p className="text-white/50 font-mono mt-1">{selectedProduct.sku}</p>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="text-white/50 hover:text-white p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Identified Gaps
              </h4>
              
              <div className="space-y-3">
                {selectedProduct.gaps.map((gap, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${gap.severity === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                    <div>
                      <div className="font-medium text-sm mb-1">Dimension {gap.dimension}</div>
                      <div className="text-white/70 text-sm">{gap.reason}</div>
                    </div>
                  </div>
                ))}
                {selectedProduct.gaps.length === 0 && (
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    No significant gaps identified.
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end">
              <button 
                onClick={() => setSelectedProduct(null)}
                className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

