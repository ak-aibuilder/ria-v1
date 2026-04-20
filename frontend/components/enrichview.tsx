"use client";

import React, { useEffect, useState } from 'react';
import { useAppStore, EnrichedProduct } from '../lib/store';
import { Sparkles, Check, X, ArrowRight, Database, ShieldCheck, Bot } from 'lucide-react';

// Mock enrichment logic
const generateMockEnrichment = (products: any[]): EnrichedProduct[] => {
  return products.map(p => {
    return {
      sku: p.sku,
      original_fields: { ...p },
      enriched_fields: {
        description: p.description 
          ? `${p.description} This premium item is designed for maximum comfort and durability. Perfect for everyday use or special occasions.`
          : `A high-quality ${p.category || 'product'} that delivers exceptional value. Designed with premium materials for lasting durability.`,
        q_and_a: [
          { q: `Is the ${p.name} suitable for daily use?`, a: "Yes, it is designed specifically for durable, everyday use." },
          { q: "What are the care instructions?", a: "We recommend standard care procedures. Check the label for specific details." }
        ],
        agent_facets: {
          "best_for": "everyday use",
          "durability": "high",
          "style": "classic"
        },
        relationship_type: "complementary_to_basics"
      },
      provenance_metadata: {
        source: "Claude 3.5 Sonnet",
        timestamp: new Date().toISOString()
      },
      confidence_scores: {
        description: 0.92,
        q_and_a: 0.88,
        agent_facets: 0.95
      }
    };
  });
};

export default function EnrichView() {
  const { state, setEnrichedProducts, setPhase } = useAppStore();
  const [isEnriching, setIsEnriching] = useState(true);
  const [progress, setProgress] = useState(0);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  useEffect(() => {
    if (state.enrichedProducts.length === 0 && state.products.length > 0) {
      // Simulate API progress
      let current = 0;
      const interval = setInterval(() => {
        current += 10;
        setProgress(current);
        if (current >= 100) {
          clearInterval(interval);
          const enriched = generateMockEnrichment(state.products);
          setEnrichedProducts(enriched);
          setIsEnriching(false);
          if (enriched.length > 0) {
            setSelectedSku(enriched[0].sku);
          }
        }
      }, 300);
      return () => clearInterval(interval);
    } else if (state.enrichedProducts.length > 0) {
      setIsEnriching(false);
      if (!selectedSku) setSelectedSku(state.enrichedProducts[0].sku);
    }
  }, [state.products, state.enrichedProducts.length, setEnrichedProducts]);

  if (isEnriching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500 max-w-md mx-auto">
        <div className="w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.4)] animate-pulse">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Enriching Catalog</h3>
        <p className="text-white/60 text-center mb-8">
          Claude is generating missing conversational attributes, Q&A pairs, and agent facets...
        </p>
        
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-white/40 font-mono">{progress}% Complete</div>
      </div>
    );
  }

  const selectedProduct = state.enrichedProducts.find(p => p.sku === selectedSku);

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
            Data Enrichment
          </h2>
          <p className="text-lg text-white/70 max-w-2xl">
            Review the AI-generated attributes. Original data is preserved, and new fields are tagged with provenance metadata.
          </p>
        </div>
        
        <button 
          onClick={() => setPhase('validate')}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 transform hover:-translate-y-0.5 whitespace-nowrap"
        >
          <Bot className="w-5 h-5" />
          Validate with Agent
          <ArrowRight className="w-5 h-5 ml-1" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Product List Sidebar */}
        <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-white/10 bg-black/20">
            <h3 className="font-semibold">Products ({state.enrichedProducts.length})</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {state.enrichedProducts.map(p => (
              <button
                key={p.sku}
                onClick={() => setSelectedSku(p.sku)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  selectedSku === p.sku 
                    ? 'bg-purple-500/20 border border-purple-500/30 text-white' 
                    : 'hover:bg-white/5 text-white/70 border border-transparent'
                }`}
              >
                <div className="font-medium truncate">{p.original_fields.name}</div>
                <div className="text-xs opacity-60 font-mono mt-1">{p.sku}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Comparison View */}
        {selectedProduct && (
          <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
              <div>
                <h3 className="text-xl font-bold">{selectedProduct.original_fields.name}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-white/50 font-mono">{selectedProduct.sku}</span>
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    {selectedProduct.provenance_metadata.source}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2">
                  <X className="w-4 h-4 text-red-400" /> Reject
                </button>
                <button className="px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 text-sm font-medium transition-colors flex items-center gap-2">
                  <Check className="w-4 h-4" /> Approve
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Description Comparison */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Description Enhancement
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                    <div className="text-xs text-white/40 mb-2">Original</div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {selectedProduct.original_fields.description || <span className="italic opacity-50">No description provided</span>}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 relative">
                    <div className="absolute top-4 right-4 text-xs text-purple-400 font-mono bg-purple-500/20 px-2 py-0.5 rounded">
                      Conf: {selectedProduct.confidence_scores.description}
                    </div>
                    <div className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Enriched
                    </div>
                    <p className="text-sm text-white leading-relaxed">
                      {selectedProduct.enriched_fields.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Q&A Generation */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Generated Q&A Pairs
                </h4>
                <div className="space-y-3">
                  {selectedProduct.enriched_fields.q_and_a?.map((qa, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div className="font-medium text-sm mb-2 text-blue-100">Q: {qa.q}</div>
                      <div className="text-sm text-blue-200/70">A: {qa.a}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Facets */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Agent-Actionable Facets
                </h4>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(selectedProduct.enriched_fields.agent_facets || {}).map(([key, val]) => (
                    <div key={key} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                      <span className="text-xs text-white/50 font-mono">{key}</span>
                      <span className="text-sm font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Need to import MessageSquare for the icon above
import { MessageSquare } from 'lucide-react';

