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
  const addTranscript = (transcript: AgentTranscript) => setState(s => ({ ...s, transcripts: [...s.transcripts, transcript] }));
  const resetSession = () => {
    sessionStorage.removeItem('ria_session');
    setState({ ...initialState, sessionId: Math.random().toString(36).substring(2, 9), lastActivity: Date.now() });
  };

  if (!isLoaded) return null; // Or a loading spinner

  return (
    <AppContext.Provider value={{ state, setPhase, setProducts, setScoredProducts, setEnrichedProducts, addTranscript, resetSession }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within AppProvider');
  return context;
};

