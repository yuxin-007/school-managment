import { APP_VERSION_CODE } from './appVersion'
import request from './request'

interface AppVersionInfo {
  versionCode: number
  versionName: string
  downloadUrl: string
  forceUpdate: boolean
  releaseNotes: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  isForceUpdate: boolean
  versionName: string
  releaseNotes: string
  downloadUrl: string
}

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const response = await request.get<{ success: boolean; data: AppVersionInfo }>('/api/app/version')
    const info = response.data.data
    const hasUpdate = info.versionCode > APP_VERSION_CODE

    return {
      hasUpdate,
      isForceUpdate: hasUpdate && info.forceUpdate,
      versionName: info.versionName,
      releaseNotes: info.releaseNotes,
      downloadUrl: info.downloadUrl,
    }
  } catch {
    return null
  }
}

export function downloadUpdate(downloadUrl: string): void {
  window.open(downloadUrl, '_system')
}
