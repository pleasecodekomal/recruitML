import React from 'react';
import { ShieldCheck, EyeOff } from 'lucide-react';

export default function BiasToggle({ anonymize, setAnonymize }) {
  return (
    <div
      onClick={() => setAnonymize((prev) => !prev)}
      style={{
        backgroundColor: anonymize ? '#0F172A' : '#FFFFFF',
        color: anonymize ? '#F8FAFC' : '#1E293B',
        padding: '6px 14px',
        borderRadius: '9999px',
        border: anonymize ? '1px solid #1E293B' : '1px solid #E2E8F0',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}
    >
      {anonymize ? (
        <EyeOff size={15} color="#34D399" />
      ) : (
        <ShieldCheck size={15} color="#64748B" />
      )}

      <span style={{ fontSize: '12px', fontWeight: 700 }}>
        Bias Reduction:{' '}
        <span style={{ color: anonymize ? '#34D399' : '#2563EB' }}>
          {anonymize ? 'ENABLED' : 'OFF'}
        </span>
      </span>

      <div
        style={{
          width: '34px',
          height: '18px',
          borderRadius: '9999px',
          backgroundColor: anonymize ? '#10B981' : '#E2E8F0',
          position: 'relative',
          transition: 'background-color 0.2s ease',
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            position: 'absolute',
            top: '3px',
            left: anonymize ? '19px' : '3px',
            transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        />
      </div>
    </div>
  );
}