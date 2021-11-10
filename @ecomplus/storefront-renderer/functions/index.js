const path = require('path')

const {
  getAssetsReferences,
  renderer,
  minifyHtml
} = require('@ecomplus/storefront-renderer')

exports.ssr = (req, res, getCacheControl) => {
  const {
    NODE_ENV,
    STOREFRONT_BUNDLES_PATH,
    STOREFRONT_LONG_CACHE
  } = process.env

  process.env.STORE_DATA_FROM_CACHE = 'true'

  const isLongCache = String(STOREFRONT_LONG_CACHE).toLowerCase() === 'true'
  const url = req.url.replace(/\?.*$/, '').replace(/\.html$/, '')

  const setStatusAndCache = (status, defaultCache) => {
    return res.status(status)
      .set('X-SSR-ID', `v2/${Math.random()}`)
      .set(
        'Cache-Control',
        (typeof getCacheControl === 'function' && getCacheControl(status)) || defaultCache
      )
  }

  const redirect = (url, status = 302) => {
    let sMaxAge = status === 301 ? 360 : 12
    if (isLongCache) {
      sMaxAge *= 10
    }
    let cacheControl = `public, max-age=30, s-maxage=${sMaxAge}`
    if (status === 302) {
      cacheControl += ', proxy-revalidate'
    }
    setStatusAndCache(status, cacheControl)
      .set('Location', url).end()
  }

  let cache
  try {
    cache = require(STOREFRONT_BUNDLES_PATH || path.join(process.cwd(), '.bundles.json'))
  } catch (err) {
    console.error(err)
  }

  const fixHtml = html => {
    if (cache) {
      html = minifyHtml(html, getAssetsReferences(cache.assetsByChunkName))
    }
    return html
  }

  const fallback = () => {
    if (url.slice(-1) === '/') {
      redirect(url.slice(0, -1))
    } else if (url !== '/404' && (/\/[^/.]+$/.test(url) || /\.x?html$/.test(url))) {
      const encodedUrl = encodeURIComponent(url)
      if (NODE_ENV !== 'development') {
        res.set('Set-Cookie', `referrerUrl=${encodedUrl}; Max-Age=30`)
        renderer('/404').then(html => {
          setStatusAndCache(404, `public, max-age=${(isLongCache ? 120 : 30)}`)
            .send(fixHtml(html))
        }).catch(err => {
          setStatusAndCache(404, 'public, max-age=5').end()
          console.error(err)
        })
      } else {
        redirect(`/404?url=${encodedUrl}`)
      }
    } else {
      setStatusAndCache(404, isLongCache
        ? 'public, max-age=60, s-maxage=86400'
        : 'public, max-age=60, s-maxage=300'
      ).end()
    }
  }

  return renderer(url)

    .then(html => {
      if (html) {
        setStatusAndCache(200, isLongCache
          ? 'public, max-age=60, s-maxage=604800'
          : 'public, max-age=60, s-maxage=300, stale-while-revalidate=2592000'
        ).send(fixHtml(html))
      } else {
        fallback()
      }
      return false
    })

    .catch(err => {
      fallback()
      console.error(err)
    })
}
