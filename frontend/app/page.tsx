"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AppProvider, useAppStore, Phase, Product } from '../lib/store';
import { AuthProvider, useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import MainApp from '../components/mainapp';
import LoginView from '../components/loginview';

interface SessionPayload {
  session_id: string;
  phase: Phase;
  products: Product[];
  scored_products: any[];
  enriched_products: any[];
}

function Hydrate() {
  const store = useAppStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const ran = useRef(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const s = await apiFetch<SessionPayload>("/session");
        const { setProducts, setScoredProducts, setEnrichedProducts, setPhase } = storeRef.current;

        const seen = new Set<string>();
        const uniqueProducts = (s.products ?? []).filter((p) => {
          if (seen.has(p.sku)) return false;
          seen.add(p.sku);
          return true;
        });
        setProducts(uniqueProducts);

        if (s.scored_products?.length) setScoredProducts(s.scored_products);

        if (s.enriched_products?.length) {
          const adapted = s.enriched_products.map((ep: any) => ({
            sku: ep.sku,
            original_fields: ep.original_fields ?? {},
            enriched_fields: {
              description: ep.enriched_fields?.description,
              q_and_a: (ep.enriched_fields?.q_and_a ?? []).map((qa: any) => ({
                q: qa.q ?? qa.question ?? "",
                a: qa.a ?? qa.answer ?? "",
                intent: qa.intent,
                speculative: qa.speculative,
              })),
              agent_facets: Object.fromEntries(
                Object.entries(ep.enriched_fields?.agent_facets ?? {}).map(
                  ([k, v]) => [k, Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "")],
                ),
              ),
              relationship_type: ep.enriched_fields?.relationship_type,
            },
            provenance_metadata: ep.provenance_metadata ?? { source: "ria_enriched", timestamp: new Date().toISOString() },
            confidence_scores: ep.confidence_scores ?? {},
          }));
          setEnrichedProducts(adapted);
        }

        // Derive phase from server-side data. Backend only updates phase when an
        // audit/enrich/validate run actually persists results, so we let local
        // navigation drive forward progress unless the server proves otherwise.
        if (s.enriched_products?.length) setPhase("enrich");
        else if (s.scored_products?.length) setPhase("audit");
        // else: leave whatever the user (or sessionStorage) had.
      } catch {
        /* ignore — auth gate already handled 401 */
      } finally {
        setDone(true);
      }
    })();
  }, []);

  if (!done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/60 text-sm">
        Loading session...
      </div>
    );
  }
  return <MainApp />;
}

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/60 text-sm">
        Loading...
      </div>
    );
  }

  if (!user) return <LoginView />;

  return (
    <AppProvider>
      <Hydrate />
    </AppProvider>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
