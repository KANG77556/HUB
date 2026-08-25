import { normalizeFingerprint, type ServerPolicy } from '../config/serverPolicy.js';

export type CertificateDecision = 0 | -2 | -3;

export type CertificateDecisionInput = {
  hostname: string;
  verificationResult: string;
  certificate: {
    fingerprint256: string;
  };
};

export type CertificateVerifyHandler = (
  request: CertificateDecisionInput,
  callback: (decision: CertificateDecision) => void,
) => void;

export type CertificateSession = {
  setCertificateVerifyProc: (handler: CertificateVerifyHandler) => void;
};

export function decideCertificate(
  request: CertificateDecisionInput,
  policy: ServerPolicy,
): CertificateDecision {
  const configuredHost = new URL(policy.baseUrl).hostname.toLowerCase();
  if (request.hostname.toLowerCase() !== configuredHost) {
    return -3;
  }
  if (request.verificationResult !== 'net::OK') {
    return -2;
  }

  const actual = normalizeFingerprint(request.certificate.fingerprint256);
  if (actual === policy.currentFingerprint || actual === policy.nextFingerprint) {
    return 0;
  }
  return -2;
}

export function installCertificatePinning(
  session: CertificateSession,
  policy: ServerPolicy,
): void {
  session.setCertificateVerifyProc((request, callback) => {
    callback(decideCertificate(request, policy));
  });
}
