import type { SchoolWorkHubBridge } from '../../shared/bridge.js';

declare global {
  interface Window {
    schoolWorkHub: SchoolWorkHubBridge;
  }
}

export {};
