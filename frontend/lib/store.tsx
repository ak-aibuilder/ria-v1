"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Phase = 'upload' | 'audit' | 'enrich' | 'validate';

export interface Product {
  sku: string;
  name: string;
  price: number;
  category?: string;
  brand?: string;
  image_urls?: string;
  description?: string;
  attributes?: Record<string, string>;
  q_and_a?: any[];
  raw_review_data?: any[];
  relationship_type?: string;
  agent_facets?: Record<string, string>;
}

export interface Gap {
  dimension: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ScoredProduct {
  sku: string;
  readiness_score: number;
  dimension_scores: {
    D1: number; // Structured Attributes
    D2: number; // Description
    D3: number; // Q&A
    D4: number; // Reviews
    D5: number; // Relationships
    D6: number; // Agent Facets
  };
  gaps: Gap[];
}

export interface EnrichedProduct {
  sku: string;
  original_fields: Partial<Product>;
  enriched_fields: {
    description?: string;
    q_and_a?: any[];
    agent_facets?: Record<string, string>;
    relationship_type?: string;
  };
  provenance_metadata: {
    source: string;
    timestamp: string;
  };
  confidence_scores: Record<string, number>;
}

export interface AgentTranscript {
  id: string;
  query_text: string;
  index_type: 'pre' | 'post';
  tool_calls: any[];
  agent_response: string;
  timestamp: string;
}

interface AppState {
  phase: Phase;
  products: Product[];
  scoredProducts: ScoredProduct[];
  enrichedProducts: EnrichedProduct[];
  transcripts: AgentTranscript[];
  sessionId: string;
  lastActivity: number;
}

interface AppContextType {
  state: AppState;
  setPhase: (phase: Phase) => void;
  setProducts: (products: Product[]) => void;
  setScoredProducts: (scored: ScoredProduct[]) => void;
  setEnrichedProducts: (enriched: EnrichedProduct[]) => void;
  updateEnrichedProduct: (sku: string, fields: Partial<EnrichedProduct['enriched_fields']>) => void;
  reAuditProduct: (sku: string) => void;
  addTranscript: (transcript: AgentTranscript) => void;
  resetSession: () => void;
}

const initialState: AppState = {
  phase: 'upload',
  products: [],
  scoredProducts: [],
  enrichedProducts: [],
  transcripts: [],
  sessionId: '',
  lastActivity: 0,
};

export const calculateProductScore = (product: Product, enrichedFields?: any): ScoredProduct => {
  const desc = enrichedFields?.description || product.description || '';
  const hasDesc = desc.length > 20;
  const hasCategory = !!product.category;
  const hasBrand = !!product.brand;
  const hasQa = enrichedFields?.q_and_a && enrichedFields.q_and_a.length > 0;
  const hasFacets = enrichedFields?.agent_facets && Object.keys(enrichedFields.agent_facets).length > 0;

  // Base scores
  const d1 = hasCategory && hasBrand ? 8.5 : 4.0;
  const d2 = hasDesc ? (enrichedFields?.description ? 9.5 : 6.5) : 3.0;
  const d3 = hasQa ? 9.5 : 2.0;
  const d4 = 3.5; // Reviews (mocked as low for demo)
  const d5 = enrichedFields?.relationship_type ? 9.0 : 4.0;
  const d6 = hasFacets ? 9.5 : 2.5;

  const scores = { D1: d1, D2: d2, D3: d3, D4: d4, D5: d5, D6: d6 };
  const readiness_score = (d1 * 0.25 + d2 * 0.15 + d3 * 0.20 + d4 * 0.10 + d5 * 0.15 + d6 * 0.15);

  const gaps: Gap[] = [];
  if (d1 < 6) gaps.push({ dimension: 'D1', severity: 'high', reason: 'Missing structured attributes (brand, category)' });
  if (d2 < 6) gaps.push({ dimension: 'D2', severity: 'medium', reason: 'Description lacks detail for agent reasoning' });
  if (d3 < 6) gaps.push({ dimension: 'D3', severity: 'high', reason: 'No conversational Q&A pairs available' });
  if (d5 < 6) gaps.push({ dimension: 'D5', severity: 'medium', reason: 'Missing product relationships' });
  if (d6 < 6) gaps.push({ dimension: 'D6', severity: 'high', reason: 'Missing agent-actionable facets' });

  return {
    sku: product.sku,
    readiness_score,
    dimension_scores: scores,
    gaps
  };
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('ria_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Check TTL (30 mins)
        if (Date.now() - parsed.lastActivity < 30 * 60 * 1000) {
          setState(parsed);
        } else {
          sessionStorage.removeItem('ria_session');
          setState({ ...initialState, sessionId: Math.random().toString(36).substring(2, 9), lastActivity: Date.now() });
        }
      } catch (e) {
        console.error("Failed to parse session", e);
      }
    } else {
      setState({ ...initialState, sessionId: Math.random().toString(36).substring(2, 9), lastActivity: Date.now() });
    }
    setIsLoaded(true);
  }, []);

  // Save to sessionStorage on change
  useEffect(() => {
    if (isLoaded) {
      const stateToSave = { ...state, lastActivity: Date.now() };
      sessionStorage.setItem('ria_session', JSON.stringify(stateToSave));
    }
  }, [state, isLoaded]);

  const setPhase = (phase: Phase) => setState(s => ({ ...s, phase }));
  const setProducts = (products: Product[]) => setState(s => ({ ...s, products }));
  const setScoredProducts = (scoredProducts: ScoredProduct[]) => setState(s => ({ ...s, scoredProducts }));
  const setEnrichedProducts = (enrichedProducts: EnrichedProduct[]) => setState(s => ({ ...s, enrichedProducts }));
  
  const updateEnrichedProduct = (sku: string, fields: Partial<EnrichedProduct['enriched_fields']>) => {
    setState(s => ({
      ...s,
      enrichedProducts: s.enrichedProducts.map(p =>
        p.sku === sku ? { ...p, enriched_fields: { ...p.enriched_fields, ...fields } } : p
      )
    }));
  };

  const reAuditProduct = (sku: string) => {
    setState(s => {
      const product = s.products.find(p => p.sku === sku);
      const enriched = s.enrichedProducts.find(p => p.sku === sku);
      if (!product) return s;

      const newScore = calculateProductScore(product, enriched?.enriched_fields);

      return {
        ...s,
        scoredProducts: s.scoredProducts.map(sp => sp.sku === sku ? newScore : sp)
      };
    });
  };

  const addTranscript = (transcript: AgentTranscript) => setState(s => ({ ...s, transcripts: [...s.transcripts, transcript] }));
  const resetSession = () => {
    sessionStorage.removeItem('ria_session');
    setState({ ...initialState, sessionId: Math.random().toString(36).substring(2, 9), lastActivity: Date.now() });
  };

  // Prevent hydration mismatch by not rendering until loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <AppContext.Provider value={{ 
      state, 
      setPhase, 
      setProducts, 
      setScoredProducts, 
      setEnrichedProducts, 
      updateEnrichedProduct,
      reAuditProduct,
      addTranscript, 
      resetSession 
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within AppProvider');
  return context;
};

