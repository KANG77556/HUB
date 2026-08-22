import { describe, expect, it, vi } from 'vitest';

import {
  decideCertificate,
  installCertificatePinning,
  type CertificateDecision,
  type CertificateSession,
  type CertificateVerifyHandler,
} from './certificatePinning.js';
import type { ServerPolicy } from '../config/serverPolicy.js';

const currentFingerprint = 'AA'.repeat(32);
const nextFingerprint = 'BB'.repeat(32);
const otherFingerprint = 'CC'.repeat(32);
const policy: ServerPolicy = {
  baseUrl: 'https://school.example:8443/api/',
  schoolCode: 'sample-school',
  currentFingerprint,
  nextFingerprint,
};

function request(
  hostname: string,
  verificationResult: string,
  fingerprint256: string,
) {
  return {
    hostname,
    verificationResult,
    certificate: { fingerprint256 },
  };
}

describe('certificate pinning', () => {
  it('uses Chromium for unrelated hosts and rejects invalid configured-host certificates', () => {
    expect(decideCertificate(request('other.example', 'net::OK', currentFingerprint), policy)).toBe(-3);
    expect(
      decideCertificate(request('school.example', 'net::ERR_CERT_DATE_INVALID', currentFingerprint), policy),
    ).toBe(-2);
    expect(decideCertificate(request('school.example', 'net::OK', otherFingerprint), policy)).toBe(
      -2,
    );
  });

  it('accepts current and next fingerprints after Chromium validation', () => {
    const currentWithColons = currentFingerprint.match(/.{2}/g)?.join(':') ?? '';
    expect(decideCertificate(request('school.example', 'net::OK', currentWithColons), policy)).toBe(0);
    expect(decideCertificate(request('school.example', 'net::OK', nextFingerprint), policy)).toBe(0);
  });

  it('installs the pure decision function on the Electron session', () => {
    let installed: CertificateVerifyHandler | undefined;
    const session: CertificateSession = {
      setCertificateVerifyProc: vi.fn((handler: CertificateVerifyHandler) => {
        installed = handler;
      }),
    };

    installCertificatePinning(session, policy);
    expect(installed).toBeDefined();
    const callback = vi.fn<(decision: CertificateDecision) => void>();
    installed?.(request('school.example', 'net::OK', currentFingerprint), callback);
    expect(callback).toHaveBeenCalledWith(0);
  });
});
