import type { NetworkStatusAdapter } from "@drakkar.software/anchor"

/**
 * React Native network status adapter using @react-native-community/netinfo.
 *
 * Requires `@react-native-community/netinfo` as a peer dependency.
 */
export class RNNetworkStatus implements NetworkStatusAdapter {
  private _isOnline = true
  private netInfo: any

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.netInfo = require("@react-native-community/netinfo").default
    } catch {
      throw new Error(
        "@react-native-community/netinfo is required. Install with: npx expo install @react-native-community/netinfo",
      )
    }
  }

  isOnline(): boolean {
    return this._isOnline
  }

  subscribe(callback: (online: boolean) => void): () => void {
    return this.netInfo.addEventListener(
      (state: { isConnected: boolean | null }) => {
        this._isOnline = state.isConnected ?? false
        callback(this._isOnline)
      },
    )
  }
}
