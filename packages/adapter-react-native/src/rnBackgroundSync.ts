import type { BackgroundTaskAdapter } from "@drakkar.software/anchor"

/**
 * React Native implementation of BackgroundTaskAdapter using
 * expo-task-manager and expo-background-fetch.
 */
export class RNBackgroundSync implements BackgroundTaskAdapter {
  private TaskManager: any
  private BackgroundFetch: any

  constructor() {
    try {
      this.TaskManager = require("expo-task-manager")
    } catch {
      throw new Error(
        "RNBackgroundSync requires expo-task-manager. Install it with: npx expo install expo-task-manager",
      )
    }
    try {
      this.BackgroundFetch = require("expo-background-fetch")
    } catch {
      throw new Error(
        "RNBackgroundSync requires expo-background-fetch. Install it with: npx expo install expo-background-fetch",
      )
    }
  }

  async register(taskName: string, handler: () => Promise<void>): Promise<void> {
    this.TaskManager.defineTask(taskName, async () => {
      try {
        await handler()
        return this.BackgroundFetch.BackgroundFetchResult.NewData
      } catch (err) {
        console.error(`[anchor:background-sync] Task "${taskName}" failed:`, err)
        return this.BackgroundFetch.BackgroundFetchResult.Failed
      }
    })

    await this.BackgroundFetch.registerTaskAsync(taskName, {
      minimumInterval: 15 * 60, // 15 minutes minimum (iOS constraint)
      stopOnTerminate: false,
      startOnBoot: true,
    })
  }

  async unregister(taskName: string): Promise<void> {
    const isRegistered = await this.TaskManager.isTaskRegisteredAsync(taskName)
    if (isRegistered) {
      await this.BackgroundFetch.unregisterTaskAsync(taskName)
    }
  }

  async isRegistered(taskName: string): Promise<boolean> {
    return this.TaskManager.isTaskRegisteredAsync(taskName)
  }
}
