import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationWindowClosedRedirect } from './application-window-closed-redirect.js'
import { getFeatureControlValue } from '../../helpers/feature-controls/feature-control-client.js'
import { isWindowClosedMockEnabled } from '../../helpers/mock-overrides.js'

vi.mock('../../helpers/feature-controls/feature-control-client.js', () => ({
  getFeatureControlValue: vi.fn()
}))

vi.mock('../../helpers/mock-overrides.js', () => ({
  isWindowClosedMockEnabled: vi.fn()
}))

describe('applicationWindowClosedRedirect', () => {
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(false)
    vi.mocked(getFeatureControlValue).mockResolvedValue(true)
  })

  function buildRequest({ slug = 'test-grant', path = '/test-grant/start', name } = {}) {
    return {
      params: { slug },
      path,
      yar: { set: vi.fn(), get: vi.fn(), clear: vi.fn() },
      app: {
        model: {
          def: { name }
        }
      }
    }
  }

  it.each([
    ['open', true],
    ['absent (default open)', null]
  ])('returns h.continue when the feature control value is %s', async (_label, featureControlValue) => {
    vi.mocked(getFeatureControlValue).mockResolvedValue(featureControlValue)
    const request = buildRequest()
    const context = { state: {} }

    const result = await applicationWindowClosedRedirect(request, h, context)

    expect(getFeatureControlValue).toHaveBeenCalledWith('application-window-open:test-grant', request)
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it.each(['SUBMITTED', 'REOPENED', 'CLAIM_STARTED', 'CLAIM_SUBMITTED'])(
    'returns h.continue when window is closed but application status is %s',
    async (applicationStatus) => {
      vi.mocked(getFeatureControlValue).mockResolvedValue(false)
      const request = buildRequest()
      const context = { state: { applicationStatus } }

      const result = await applicationWindowClosedRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, 'CLEARED'])(
    'redirects to the application-window-closed page when window is closed and status is %s',
    async (applicationStatus) => {
      const takeover = Symbol('takeover')
      h.redirect.mockReturnValue({ takeover: () => takeover })
      vi.mocked(getFeatureControlValue).mockResolvedValue(false)

      const request = buildRequest({ name: 'Test Grant' })
      const context = { state: { applicationStatus } }

      const result = await applicationWindowClosedRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
      expect(request.yar.set).toHaveBeenCalledWith('applicationWindowClosedSchemeName', 'Test Grant')
      expect(result).toBe(takeover)
    }
  )

  it('returns h.continue when already on the application-window-closed page', async () => {
    vi.mocked(getFeatureControlValue).mockResolvedValue(false)
    const request = buildRequest({
      path: '/test-grant/application-window-closed'
    })
    const context = { state: {} }

    const result = await applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('redirects when the dev-tools mock is enabled, even if the feature control value is open', async () => {
    const takeover = Symbol('takeover')
    h.redirect.mockReturnValue({ takeover: () => takeover })
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(true)
    vi.mocked(getFeatureControlValue).mockResolvedValue(true)

    const request = buildRequest({ name: 'Test Grant' })
    const context = { state: {} }

    const result = await applicationWindowClosedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
    expect(result).toBe(takeover)
  })

  it('returns h.continue when the mock is enabled but the application is already submitted', async () => {
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(true)
    vi.mocked(getFeatureControlValue).mockResolvedValue(true)

    const request = buildRequest()
    const context = { state: { applicationStatus: 'SUBMITTED' } }

    const result = await applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
