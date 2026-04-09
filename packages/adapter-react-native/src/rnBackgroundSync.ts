import type { BackgroundTaskAdapter } from "@drakkar.software/anchor"

type TaskManagerModule = {
  defineTask: (name: string, handler: () => Promise<any>) => void
  isTaskRegisteredAsync: (name: string) => Promise<boolean>
}

type BackgroundFetchModule = {
  registerTaskAsync: (name: string, options: object) => Promise<void>
  unregisterTaskAsync: (name: string) => Promise<void>
  BackgroundFetchResult: { NewData: unknown; Failed: unknown }
}

/**
 * React Native implementation of BackgroundTaskAdapter using
 * expo-task-manager and expo-background-fetch.
 *
 * Pass both modules to avoid bundler resolution issues in pnpm
 * virtual store environments.
 *
 * @example
 * import * as TaskManager from 'expo-task-manager'
 * import * as BackgroundFetch from 'expo-background-fetch'
 * new RNBackgroundSync(TaskManager, BackgroundFetch)
 */
export class RNBackgroundSync implements BackgroundTaskAdapter {
  private TaskManager: TaskManagerModule
  private BackgroundFetch: BackgroundFetchModule

  constructor(TaskManager: TaskManagerModule, BackgroundFetch: BackgroundFetchModule) {
    this.TaskManager = TaskManager
    this.BackgroundFetch = BackgroundFetch
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
