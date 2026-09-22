import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  ERROR_MESSAGES,
  HTTP_STATUS
} from '../state/test-helpers/auth-test-helpers.js'
import { mockSimpleRequest, createMockFetchResponse } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../auth/backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: vi.fn(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${Buffer.from('test').toString('base64')}`
  }))
}))

const mockFetch = vi.hoisted(() => vi.fn())
global.fetch = mockFetch

vi.mock('../logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

let getFeatureControlValue
let log
let LogCodes
let mockRequest

/**
 * Registers the beforeAll/beforeEach/afterAll lifecycle that (re)loads the client
 * module under a fresh config mock, then hands the loaded module to `onLoad`.
 * @param {(helper: object) => void} onLoad - Assigns the exports under test from the loaded module.
 * @param {() => object} [configFactory] - Config mock factory (with or without endpoint).
 */
function loadClientModule(onLoad, configFactory = createMockConfig) {
  beforeAll(async () => {
    vi.resetModules()
    vi.doMock('~/src/config/config.js', configFactory)
    const helper = await import(
      '~/src/server/common/helpers/feature-controls/feature-control-client.js?t=' + Date.now()
    )
    log = (await import('../logging/log.js')).log
    LogCodes = (await import('../logging/log.js')).LogCodes
    onLoad(helper)
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.doUnmock('~/src/config/config.js')
  })
}

const expectApiLog = (logCode, fields) =>
  expect(log).toHaveBeenCalledWith(logCode, expect.objectContaining(fields), mockRequest)

describe('getFeatureControlValue', () => {
  const key = 'application-window-open:woodland'

  beforeEach(() => {
    mockRequest = mockSimpleRequest()
  })

  describe('With backend configured correctly', () => {
    loadClientModule((helper) => {
      getFeatureControlValue = helper.getFeatureControlValue
    })

    it('returns the parsed boolean value from a GET to /feature-controls/{key}', async () => {
      mockFetch.mockResolvedValue(createMockFetchResponse({ data: false }))

      const result = await getFeatureControlValue(key, mockRequest)

      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/feature-controls/${encodeURIComponent(key)}`),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.any(String)
          })
        })
      )
      expectApiLog(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
        method: 'GET',
        endpoint: expect.stringContaining('/feature-controls/'),
        identity: key
      })
    })

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.NOT_FOUND }))

      const result = await getFeatureControlValue(key, mockRequest)

      expect(result).toBeNull()
      expectApiLog(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
        method: 'GET',
        endpoint: expect.stringContaining('/feature-controls/'),
        summary: 'No feature control found'
      })
    })

    it('throws a Boom error on non-200 (not 404)', async () => {
      mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.INTERNAL_SERVER_ERROR }))

      const error = await getFeatureControlValue(key, mockRequest).catch((e) => e)

      expect(error.isBoom).toBe(true)
      expect(error.output.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      expectApiLog(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'GET',
        endpoint: expect.stringContaining('/feature-controls/'),
        error: `Failed to fetch feature control: ${HTTP_STATUS.INTERNAL_SERVER_ERROR}`
      })
    })

    it('throws when the response body is not a boolean', async () => {
      mockFetch.mockResolvedValue(createMockFetchResponse({ data: { value: false } }))

      await expect(getFeatureControlValue(key, mockRequest)).rejects.toThrow()

      expectApiLog(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'GET',
        endpoint: expect.stringContaining('/feature-controls/'),
        error: expect.stringContaining('Unexpected feature control value format')
      })
    })

    it('throws and logs error on fetch failure', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      mockFetch.mockRejectedValue(networkError)

      await expect(getFeatureControlValue(key, mockRequest)).rejects.toThrow()

      expectApiLog(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'GET',
        endpoint: expect.stringContaining('/feature-controls/'),
        errorMessage: ERROR_MESSAGES.NETWORK_ERROR
      })
    })
  })

  describe('Without backend endpoint configured', () => {
    loadClientModule((helper) => {
      getFeatureControlValue = helper.getFeatureControlValue
    }, createMockConfigWithoutEndpoint)

    it('returns null when GRANTS_UI_BACKEND_ENDPOINT is not configured', async () => {
      const result = await getFeatureControlValue(key, mockRequest)

      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
