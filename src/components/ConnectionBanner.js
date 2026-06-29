import React, { useEffect, useState } from 'react';
import { subscribe } from '../lib/connectionStatus';

export default function ConnectionBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => subscribe(setShow), []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: '#e67e22', color: 'white', textAlign: 'center',
      padding: '8px 12px', fontSize: 13, fontWeight: 'bold',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      ⚠️ Conexión inestable, reintentando...
    </div>
  );
}
