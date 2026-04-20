"use client";

import React from 'react';
import { AppProvider } from '../lib/store';
import MainApp from '../components/mainapp';

export default function Home() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

