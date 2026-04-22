"use client";

import React from 'react';
import { AppProvider } from '../lib/store';
import { AuthProvider, useAuth } from '../lib/auth';
import MainApp from '../components/mainapp';
import LoginView from '../components/loginview';

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
      <MainApp />
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
