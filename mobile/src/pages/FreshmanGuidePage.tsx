import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { useEffect, useMemo, useRef, useState } from 'react'
import campusMapImage from '@/assets/campus-map-clear.jpeg'
import { campusLocations, categoryColors, categoryLabels, type CampusLocation } from '@/data/campusGuide'
import {
  buildAmapStaticMapUrl,
  DEFAULT_AMAP_KEY,
  loadAmap,
  type AmapMap,
  type AmapMarker,
  type AmapNamespace,
  type AmapOverlay,
  type LngLatTuple,
} from '@/lib/amap'
import { getApiErrorMessage } from '@/lib/request'
import { useAuthStore } from '@/store/authStore'

const campusEntryLngLat: LngLatTuple = [116.834556, 36.543568]
const campusBounds = { east: 116.842, north: 36.553, south: 36.541, west: 116.826 }

type MapStatus = 'loading' | 'ready' | 'static' | 'fallback'

type AMapWalkingResponse = {
  info?: string
  route?: {
    paths?: Array<{
      distance?: string
      steps?: Array<{ polyline?: string }>
    }>
  }
  status: string
}

const isInsideCampusBounds = ([lng, lat]: LngLatTuple) =>
  lng >= campusBounds.west && lng <= campusBounds.east && lat >= campusBounds.south && lat <= campusBounds.north

const getBrowserCurrentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 12000,
    })
  })

const getCurrentLngLat = async (): Promise<LngLatTuple> => {
  if (Capacitor.isNativePlatform()) {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
    return [position.coords.longitude, position.coords.latitude]
  }
  const position = await getBrowserCurrentPosition()
  return [position.coords.longitude, position.coords.latitude]
}

const getLocationErrorMessage = (err: unknown) => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = Number((err as { code: unknown }).code)
    if (code === 1) return '定位权限被拒绝，请在浏览器地址栏允许定位后重试。'
    if (code === 2) return '暂时无法获取当前位置，已使用校区北门作为起点。'
    if (code === 3) return '定位请求超时，已使用校区北门作为起点。'
  }
  return getApiErrorMessage(err, '定位失败，已使用校区北门作为起点。')
}

const lngLatToString = ([lng, lat]: LngLatTuple) => `${lng.toFixed(6)},${lat.toFixed(6)}`

const markerContent = (item: CampusLocation, active = false) => {
  const color = categoryColors[item.category]
  return `<div class="amap-location-marker ${active ? 'active' : ''}" style="--pin-color:${color}">${item.name}</div>`
}

const fetchWalkingRoute = async (key: string, origin: LngLatTuple, destination: LngLatTuple, signal: AbortSignal) => {
  const params = new URLSearchParams({
    destination: lngLatToString(destination),
    key,
    origin: lngLatToString(origin),
  })
  const response = await fetch(`https://restapi.amap.com/v3/direction/walking?${params.toString()}`, { signal })
  const data = (await response.json()) as AMapWalkingResponse
  const path = data.route?.paths?.[0]
  if (data.status !== '1' || !path) throw new Error(data.info || '高德步行路线规划失败')
  return {
    distance: path.distance ? Number(path.distance) : null,
    route: (path.steps || [])
      .flatMap((step) => (step.polyline || '').split(';'))
      .map((point) => point.split(',').map(Number) as LngLatTuple)
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)),
  }
}

const FreshmanGuidePage = () => {
  const user = useAuthStore((state) => state.user)
  const amapKey = (import.meta.env.VITE_AMAP_KEY as string | undefined) || DEFAULT_AMAP_KEY
  const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<AmapMap | null>(null)
  const amapRef = useRef<AmapNamespace | null>(null)
  const routeLineRef = useRef<AmapOverlay | null>(null)
  const markersRef = useRef<AmapMarker[]>([])
  const userMarkerRef = useRef<AmapMarker | null>(null)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CampusLocation>(campusLocations[2])
  const [isSearchOpen, setSearchOpen] = useState(false)
  const [studentLngLat, setStudentLngLat] = useState<LngLatTuple>(campusEntryLngLat)
  const [isLocating, setLocating] = useState(false)
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading')
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [staticMapUrl, setStaticMapUrl] = useState('')
  const [message, setMessage] = useState('正在连接高德地图。')

  const filteredLocations = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return campusLocations
    return campusLocations.filter((item) =>
      item.name.toLowerCase().includes(text) || item.keywords.some((keyword) => keyword.toLowerCase().includes(text)),
    )
  }, [query])

  useEffect(() => {
    let disposed = false
    const container = mapContainerRef.current
    if (!container) return

    const initMap = async () => {
      if (!amapSecurityCode) {
        setMapStatus('static')
        setMessage('当前高德 JSAPI 缺少安全密钥，已切换为高德静态地图，优先保证道路和建筑完整显示。')
        return
      }

      try {
        const AMap = await loadAmap(amapKey, amapSecurityCode)
        if (disposed || !mapContainerRef.current) return
        amapRef.current = AMap
        const map = new AMap.Map(mapContainerRef.current, {
          center: selected.lngLat,
          resizeEnable: true,
          viewMode: '2D',
          zoom: 16,
        })
        mapRef.current = map
        map.addControl(new AMap.Scale())
        map.addControl(new AMap.ToolBar({ position: 'RB' }))

        const markers = campusLocations.map((item) => {
          const marker = new AMap.Marker({
            content: markerContent(item, item.id === selected.id),
            offset: new AMap.Pixel(-18, -42),
            position: item.lngLat,
          })
          marker.on('click', () => {
            setSelected(item)
            setSearchOpen(false)
          })
          return marker
        })
        markersRef.current = markers
        map.add(markers)

        userMarkerRef.current = new AMap.Marker({
          content: '<div class="amap-user-marker">我</div>',
          offset: new AMap.Pixel(-16, -16),
          position: studentLngLat,
        })
        map.add(userMarkerRef.current)
        setMapStatus('ready')
        setMessage('高德地图已加载，选择地点即可查看校内步行路线。')
      } catch (err) {
        if (disposed) return
        setMapStatus('static')
        setMessage(getApiErrorMessage(err, '高德 JS 地图加载失败，已切换为高德静态地图。'))
      }
    }

    void initMap()
    return () => {
      disposed = true
      mapRef.current?.destroy()
      mapRef.current = null
      routeLineRef.current = null
      markersRef.current = []
      userMarkerRef.current = null
    }
  }, [amapKey, amapSecurityCode])

  useEffect(() => {
    if (mapStatus !== 'ready' && mapStatus !== 'static') return
    const controller = new AbortController()
    const AMap = amapRef.current
    const map = mapRef.current

    if (mapStatus === 'ready' && AMap && map && routeLineRef.current) {
      map.remove(routeLineRef.current)
      routeLineRef.current = null
    }

    if (mapStatus === 'ready' && map) {
      userMarkerRef.current?.setPosition(studentLngLat)
      map.setZoomAndCenter(16, selected.lngLat)
    }

    const drawRoute = async () => {
      try {
        const result = await fetchWalkingRoute(amapKey, studentLngLat, selected.lngLat, controller.signal)
        if (controller.signal.aborted) return
        const path = result.route.length ? result.route : [studentLngLat, selected.lngLat]
        if (mapStatus === 'ready' && AMap && map) {
          const line = new AMap.Polyline({
            borderWeight: 2,
            isOutline: true,
            outlineColor: '#ffffff',
            path,
            strokeColor: '#ff7a2f',
            strokeOpacity: 0.95,
            strokeWeight: 8,
          })
          routeLineRef.current = line
          map.add(line)
          map.setFitView([line], false, [80, 60, 120, 60], 17)
        } else {
          setStaticMapUrl(buildAmapStaticMapUrl({ destination: selected.lngLat, key: amapKey, origin: studentLngLat, path }))
        }
        setDistanceMeters(typeof result.distance === 'number' ? Math.round(result.distance) : null)
        setMessage(`已规划到「${selected.name}」的高德步行路线。`)
      } catch (err) {
        if (controller.signal.aborted) return
        if (mapStatus === 'ready' && AMap && map) {
          const line = new AMap.Polyline({
            path: [studentLngLat, selected.lngLat],
            strokeColor: '#ff7a2f',
            strokeOpacity: 0.72,
            strokeStyle: 'dashed',
            strokeWeight: 6,
          })
          routeLineRef.current = line
          map.add(line)
          map.setFitView([line], false, [80, 60, 120, 60], 17)
        } else {
          setStaticMapUrl(buildAmapStaticMapUrl({ destination: selected.lngLat, key: amapKey, origin: studentLngLat }))
        }
        setDistanceMeters(null)
        setMessage(getApiErrorMessage(err, `已定位到「${selected.name}」，路线规划暂不可用。`))
      }
    }

    void drawRoute()
    return () => controller.abort()
  }, [amapKey, mapStatus, selected, studentLngLat])

  const refreshLocation = async () => {
    if (isLocating) return
    setLocating(true)
    setMessage('正在获取当前位置，请在系统弹窗中允许定位。')
    try {
      const next = await getCurrentLngLat()
      if (!isInsideCampusBounds(next)) {
        setStudentLngLat(campusEntryLngLat)
        setMessage('当前位置不在长清湖校区范围内，已使用北门作为导航起点。')
        return
      }
      setStudentLngLat(next)
      setMessage('已定位到校内当前位置，并重新规划路线。')
    } catch (err) {
      setStudentLngLat(campusEntryLngLat)
      setMessage(getLocationErrorMessage(err))
    } finally {
      setLocating(false)
    }
  }

  const selectLocation = (item: CampusLocation) => {
    setSelected(item)
    setSearchOpen(false)
    setDistanceMeters(null)
  }

  return (
    <div className="guide-page">
      <section className="guide-topbar">
        <div>
          <span className="eyebrow">Freshman Guide</span>
          <h2>新生校园导航</h2>
        </div>
        <button className="guide-icon-button" onClick={() => setSearchOpen(true)} aria-label="搜索地点">
          搜
        </button>
      </section>

      {message ? <div className="notice-line">{message}</div> : null}

      <section className="guide-map-shell amap-live-shell">
        <div className="guide-map-toolbar">
          <button onClick={refreshLocation} disabled={isLocating}>{isLocating ? '定位中' : '定位'}</button>
          <button onClick={() => setSearchOpen(true)}>地点</button>
        </div>
        <div className={`amap-live-container ${mapStatus !== 'ready' && mapStatus !== 'loading' ? 'hidden' : ''}`} ref={mapContainerRef} />
        {mapStatus === 'loading' ? (
          <div className="amap-loading">
            <strong>正在连接高德地图</strong>
            <span>加载真实道路、校区建筑和步行路线</span>
          </div>
        ) : null}
        {mapStatus === 'static' ? (
          <div className="guide-static-map">
            {staticMapUrl ? <img src={staticMapUrl} alt={`高德地图：从当前位置到${selected.name}`} /> : null}
          </div>
        ) : null}
        {mapStatus === 'fallback' ? (
          <div className="guide-fallback-map">
            <img src={campusMapImage} alt="离线校区地图" />
          </div>
        ) : null}
      </section>

      <section className="route-panel">
        <div>
          <span className="eyebrow">Destination</span>
          <h3>{selected.name}</h3>
          <p>{selected.summary}</p>
        </div>
        <div className="route-stats">
          <span>{categoryLabels[selected.category]}</span>
          <strong>{distanceMeters ? `${distanceMeters}m` : '--'}</strong>
        </div>
      </section>

      <section className="guide-location-strip" aria-label="常用地点">
        {campusLocations.slice(0, 8).map((item) => (
          <button className={item.id === selected.id ? 'active' : ''} key={item.id} onClick={() => selectLocation(item)}>
            {item.name}
          </button>
        ))}
      </section>

      {isSearchOpen ? (
        <div className="guide-search-sheet">
          <div className="guide-search-card">
            <div className="section-head">
              <h3>搜索地点</h3>
              <button className="text-button" onClick={() => setSearchOpen(false)}>关闭</button>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入图书馆、一餐、宿舍、文渊楼等" autoFocus />
            <div className="guide-location-list">
              {filteredLocations.map((item) => (
                <button key={item.id} onClick={() => selectLocation(item)}>
                  <span style={{ background: categoryColors[item.category] }} />
                  <strong>{item.name}</strong>
                  <em>{categoryLabels[item.category]}</em>
                </button>
              ))}
              {!filteredLocations.length ? <p className="empty-text">没有找到对应地点</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <p className="guide-footnote">
        {user?.real_name || '同学'}，当前使用高德地图 API 进行校内点位展示和路线规划；定位失败时默认从北门出发。
      </p>
    </div>
  )
}

export default FreshmanGuidePage
