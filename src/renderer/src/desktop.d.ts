import type { DesktopApi } from '../../shared/types'

declare global {
  interface Window {
    studyAssistant: DesktopApi
  }
}

export {}
