import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function SmartQRCode({ token, size = 200 }) {
  // The scanner device will navigate to this absolute URL, 
  // where the QRResolver acts as a secure traffic controller.
  const qrUrl = `${window.location.origin}/scan/${token}`;

  return (
    <div style={{
      background: '#ffffff',
      padding: 'var(--spacing-md)',
      borderRadius: 'var(--radius-lg)',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)',
      border: '3px solid var(--accent-cyan)'
    }}>
      <QRCodeSVG 
        value={qrUrl} 
        size={size}
        bgColor="#ffffff"
        fgColor="#000000"
        level="H" // High error correction, allows easier scanning from distance
        includeMargin={false}
      />
      
      {/* Human-readable token snippet for manual entry if needed */}
      <span style={{ color: '#000000', fontFamily: 'monospace', fontSize: '12px', marginTop: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>
        ID: {token.split('-')[0] || token}
      </span>
    </div>
  );
}