"use client";

import React from 'react';
import { AppProvider } from '../lib/store';
import MainApp from '../components/MainApp';

export default function Home() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

