import type { AppLifecycleAdapter } from "@drakkar.software/anchor"

type AppStateModule = {
  currentState: string
  addEventListener: (
    event: string,
    handler: (state: string) => void,
  ) => { remove: () => void }
}

/**
 * React Native implementation of AppLifecycleAdapter using AppState.
 * Maps AppState "active" to foreground, "background"/"inactive" to background.
 *
 * Pass AppState from react-native to avoid bundler resolution issues
 * in pnpm virtual store environments.
 *
 * @example
 * import { AppState } from 'react-native'
 * new RNAppLifecycle(AppState)
 */
export class RNAppLifecycle implements AppLifecycleAdapter {
  private AppState: AppStateModule

  constructor(AppState: AppStateModule) {
    this.AppState = AppState
  }

  onForeground(cb: () => void): () => void {
    let previousState = this.AppState.currentState
    const subscription = this.AppState.addEventListener(
      "change",
      (nextState: string) => {
        if (previousState !== "active" && nextState === "active") {
          cb()
        }
        previousState = nextState
      },
    )
    return () => subscription.remove()
  }

  onBackground(cb: () => void): () => void {
    let previousState = this.AppState.currentState
    const subscription = this.AppState.addEventListener(
      "change",
      (nextState: string) => {
        if (previousState === "active" && nextState !== "active") {
          cb()
        }
        previousState = nextState
      },
    )
    return () => subscription.remove()
  }
}
