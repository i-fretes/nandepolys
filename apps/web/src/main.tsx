import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import Home from './pages/Home';
import Room from './pages/Room';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sala/:code" element={<Room />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: 14, fontWeight: 600 } }} />
    </BrowserRouter>
  </React.StrictMode>,
);
