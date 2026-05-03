export const DEFAULT_AMAP_KEY = '4b75a1b0d77268fa4be82e2a6b5fbbd3'

export type LngLatTuple = [number, number]

export interface AmapLngLatObject {
  lng: number
  lat: number
}

export interface AmapNamespace {
  Geolocation: new (options?: Record<string, unknown>) => {
    getCurrentPosition: (callback: (status: string, result: { position?: AmapLngLatObject; message?: string }) => void) => void
  }
  LngLat: new (lng: number, lat: number) => unknown
  Map: new (container: HTMLElement, options?: Record<string, unknown>) => AmapMap
  Marker: new (options?: Record<string, unknown>) => AmapMarker
  Pixel: new (x: number, y: number) => unknown
  Polyline: new (options?: Record<string, unknown>) => AmapOverlay
  Scale: new () => AmapOverlay
  ToolBar: new (options?: Record<string, unknown>) => AmapOverlay
}

export interface AmapMap {
  add: (overlay: AmapOverlay | AmapOverlay[]) => void
  addControl: (control: AmapOverlay) => void
  destroy: () => void
  remove: (overlay: AmapOverlay | AmapOverlay[]) => void
  setFitView: (overlays?: AmapOverlay[], immediately?: boolean, avoid?: number[], maxZoom?: number) => void
  setZoomAndCenter: (zoom: number, center: LngLatTuple) => void
}

export interface AmapOverlay {
  setMap?: (map: AmapMap | null) => void
}

export interface AmapMarker extends AmapOverlay {
  on: (eventName: string, handler: () => void) => void
  setPosition: (position: LngLatTuple) => void
}

declare global {
  interface Window {
    AMap?: AmapNamespace
    _AMapSecurityConfig?: {
      securityJsCode?: string
    }
  }
}

const scriptId = 'amap-js-api'
const plugins = ['AMap.Scale', 'AMap.ToolBar', 'AMap.Geolocation']

export const buildAmapScriptUrl = (key: string) => {
  const url = new URL('https://webapi.amap.com/maps')
  url.searchParams.set('v', '2.0')
  url.searchParams.set('key', key)
  url.searchParams.set('plugin', plugins.join(','))
  return url.toString()
}

export const normalizeLngLat = (value: LngLatTuple | AmapLngLatObject): LngLatTuple => {
  if (Array.isArray(value)) return value
  return [value.lng, value.lat]
}

const lngLatToString = ([lng, lat]: LngLatTuple) => `${lng.toFixed(6)},${lat.toFixed(6)}`

const routeCenter = (origin: LngLatTuple, destination: LngLatTuple) => {
  const lng = (origin[0] + destination[0]) / 2
  const lat = (origin[1] + destination[1]) / 2
  return lngLatToString([lng, lat])
}

export const buildAmapStaticMapUrl = ({
  destination,
  key,
  origin,
  path = [],
  zoom = 17,
}: {
  destination: LngLatTuple
  key: string
  origin: LngLatTuple
  path?: LngLatTuple[]
  zoom?: number
}) => {
  const url = new URL('https://restapi.amap.com/v3/staticmap')
  const route = path.length ? path : [origin, destination]
  url.searchParams.set('key', key)
  url.searchParams.set('location', routeCenter(origin, destination))
  url.searchParams.set('zoom', String(zoom))
  url.searchParams.set('size', '1024*1024')
  url.searchParams.set('scale', '2')
  url.searchParams.set('markers', `mid,,A:${lngLatToString(origin)}|mid,,B:${lngLatToString(destination)}`)
  url.searchParams.set('paths', `8,0xFF7A2F,1,,0:${route.map(lngLatToString).join(';')}`)
  return url.toString()
}

export const loadAmap = (key = DEFAULT_AMAP_KEY, securityJsCode?: string): Promise<AmapNamespace> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('AMap is only available in the browser'))
  }

  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode }
  }

  if (window.AMap) return Promise.resolve(window.AMap)

  const existing = document.getElementById(scriptId) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => (window.AMap ? resolve(window.AMap) : reject(new Error('AMap failed to initialize'))), { once: true })
      existing.addEventListener('error', () => reject(new Error('AMap script failed to load')), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = buildAmapScriptUrl(key)
    script.onload = () => (window.AMap ? resolve(window.AMap) : reject(new Error('AMap failed to initialize')))
    script.onerror = () => reject(new Error('AMap script failed to load'))
    document.head.appendChild(script)
  })
}
