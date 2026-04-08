import type { AppLifecycleAdapter } from "anchor"

/**
 * React Native implementation of AppLifecycleAdapter using AppState.
 * Maps AppState "active" to foreground, "background"/"inactive" to background.
 */
export class RNAppLifecycle implements AppLifecycleAdapter {
  private AppState: any

  constructor() {
    try {
      // Dynamic require to avoid bundling issues when not installed
      const rn = require("react-native")
      this.AppState = rn.AppState
    } catch {
      throw new Error(
        "RNAppLifecycle requires react-native. Install it with: npm install react-native",
      )
    }
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
