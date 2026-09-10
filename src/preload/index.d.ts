import type { QubiqApi } from './index'

declare global {
  interface Window {
    qubiq: QubiqApi
  }
}

export {}
