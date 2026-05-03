import { describe, expect, it } from 'vitest'
import { buildAmapScriptUrl, buildAmapStaticMapUrl, normalizeLngLat } from './amap'

describe('amap helpers', () => {
  it('builds the AMap JS API url with the supplied key and plugins', () => {
    const url = new URL(buildAmapScriptUrl('test-key'))

    expect(url.origin).toBe('https://webapi.amap.com')
    expect(url.pathname).toBe('/maps')
    expect(url.searchParams.get('key')).toBe('test-key')
    expect(url.searchParams.get('v')).toBe('2.0')
    expect(url.searchParams.get('plugin')).toContain('AMap.Geolocation')
  })

  it('normalizes lnglat objects and tuples into tuples', () => {
    expect(normalizeLngLat([116.1, 36.2])).toEqual([116.1, 36.2])
    expect(normalizeLngLat({ lng: 117.3, lat: 35.4 })).toEqual([117.3, 35.4])
  })

  it('builds a static map url centered on a destination', () => {
    const url = new URL(buildAmapStaticMapUrl({
      destination: [116.2, 36.3],
      key: 'test-key',
      origin: [116.1, 36.2],
      path: [[116.1, 36.2], [116.2, 36.3]],
    }))

    expect(url.origin).toBe('https://restapi.amap.com')
    expect(url.pathname).toBe('/v3/staticmap')
    expect(url.searchParams.get('key')).toBe('test-key')
    expect(url.searchParams.get('markers')).toContain('116.100000,36.200000')
    expect(url.searchParams.get('paths')).toContain('116.100000,36.200000')
  })
})
